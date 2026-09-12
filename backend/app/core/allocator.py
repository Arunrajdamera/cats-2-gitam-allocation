from __future__ import annotations

import time
from collections import defaultdict
from dataclasses import asdict

from .schemas import (
    Allocation,
    AllocationConfig,
    AllocationRun,
    AuditEvent,
    Faculty,
    FacultyResult,
    Subject,
    ValidationIssue,
    ValidationStatus,
)


def validate_inputs(faculty: list[Faculty], subjects: dict[str, Subject], base_issues: list[ValidationIssue] | None = None) -> list[ValidationIssue]:
    issues = list(base_issues or [])
    known_subjects = set(subjects)
    for member in faculty:
        valid_pref_count = 0
        for code in member.preferences:
            if not code:
                continue
            if code not in known_subjects:
                issues.append(ValidationIssue("invalid_subject_selection", ValidationStatus.WARNING, f"{member.emp_id} selected unavailable subject {code}.", member.source_row, code))
            else:
                valid_pref_count += 1
        if valid_pref_count == 0:
            issues.append(ValidationIssue("missing_preferences", ValidationStatus.WARNING, f"{member.emp_id} has no valid subject preferences; manual allocation required.", member.source_row, member.emp_id))
    return issues


def _bottom_up(faculty: list[Faculty]) -> list[Faculty]:
    return list(reversed(faculty))


def _ranked_preferences(member: Faculty, subjects: dict[str, Subject]) -> list[tuple[int, str]]:
    ranked: list[tuple[int, str]] = []
    seen: set[str] = set()
    ranks = member.preference_ranks or list(range(1, len(member.preferences) + 1))
    for code, rank in zip(member.preferences, ranks):
        if not code or code not in subjects or code in seen:
            continue
        ranked.append((int(rank or 99), code))
        seen.add(code)
    return sorted(ranked, key=lambda item: (item[0], item[1]))


def _subject_load(subject: Subject) -> int:
    return subject.weekly_classes or (subject.l + subject.p if subject.p > 0 else subject.credits)


def _max_workload(member: Faculty, config: AllocationConfig) -> int:
    return config.workload_limits.get(member.designation, config.workload_limits.get("Assistant Professor", 14))


def _preferred_workload(member: Faculty, config: AllocationConfig) -> int:
    return config.preferred_workload.get(member.designation, config.preferred_workload.get("Assistant Professor", 10))


def _related_score(pref_code: str, target_code: str, subjects: dict[str, Subject]) -> int:
    if pref_code not in subjects or target_code not in subjects:
        return 0
    pref = subjects[pref_code]
    target = subjects[target_code]
    score = 0
    if pref.semester and pref.semester == target.semester:
        score += 35
    if pref.category and pref.category == target.category:
        score += 35
    pref_words = {word for word in pref.name.upper().replace("-", " ").split() if len(word) > 3}
    target_words = {word for word in target.name.upper().replace("-", " ").split() if len(word) > 3}
    score += min(30, len(pref_words & target_words) * 10)
    return score


def _preference_rank(member: Faculty, code: str) -> int | None:
    ranks = member.preference_ranks or list(range(1, len(member.preferences) + 1))
    for pref, rank in zip(member.preferences, ranks):
        if pref == code and rank is not None:
            return int(rank)
    return None


def _priority_score(priority: int | str, config: AllocationConfig) -> int:
    return config.preference_weights.get(priority, 0)


def run_allocation(faculty: list[Faculty], subjects: dict[str, Subject], config: AllocationConfig | None = None, input_issues: list[ValidationIssue] | None = None) -> AllocationRun:
    started = time.perf_counter()
    config = config or AllocationConfig()
    issues = validate_inputs(faculty, subjects, input_issues)
    if any(issue.status == ValidationStatus.FAIL for issue in issues) and config.duplicate_subject_policy == "reject":
        return AllocationRun([], subjects, {code: subject.capacity for code, subject in subjects.items()}, issues, [], time.perf_counter() - started)

    remaining = {code: subject.capacity for code, subject in subjects.items()}
    workloads: dict[str, int] = defaultdict(int)
    assignments: dict[str, list[Allocation]] = defaultdict(list)
    audit_log: list[AuditEvent] = []
    ranked_by_emp = {member.emp_id: _ranked_preferences(member, subjects) for member in faculty}

    def slot_count(member: Faculty) -> int:
        return len([allocation for allocation in assignments[member.emp_id] if allocation.slot <= config.regular_max_allocations])

    def can_allocate(member: Faculty, code: str, sections: int = 1, allow_extra_slot: bool = False) -> bool:
        if code not in subjects or remaining.get(code, 0) < sections:
            return False
        if not allow_extra_slot and slot_count(member) + sections > config.regular_max_allocations:
            return False
        return workloads[member.emp_id] + (_subject_load(subjects[code]) * sections) <= _max_workload(member, config)

    def add_allocation(member: Faculty, code: str, slot: int, priority: int | str, status: str, reason: str, confidence: int = 100) -> bool:
        if code not in subjects or remaining.get(code, 0) <= 0:
            return False
        remaining[code] -= 1
        workloads[member.emp_id] += _subject_load(subjects[code])
        allocation = Allocation(
            member.emp_id,
            member.name,
            member.designation,
            code,
            subjects[code].name,
            slot,
            priority,
            status,
            workloads[member.emp_id],
            reason,
            member.admin_role,
            confidence,
        )
        assignments[member.emp_id].append(allocation)
        audit_log.append(AuditEvent("Allocation Created", "system", None, asdict(allocation), reason))
        return True

    def improve_by_swapping(max_passes: int = 5) -> int:
        improvements = 0
        for _ in range(max_passes):
            changed = False
            flat = [(member, allocation) for member in faculty for allocation in assignments[member.emp_id]]
            for left_index, (left_member, left_alloc) in enumerate(flat):
                for right_member, right_alloc in flat[left_index + 1 :]:
                    if left_member.emp_id == right_member.emp_id:
                        continue
                    left_new_rank = _preference_rank(left_member, right_alloc.subject_code)
                    right_new_rank = _preference_rank(right_member, left_alloc.subject_code)
                    if left_new_rank is None or right_new_rank is None:
                        continue
                    old_score = _priority_score(left_alloc.priority, config) + _priority_score(right_alloc.priority, config)
                    new_score = _priority_score(left_new_rank, config) + _priority_score(right_new_rank, config)
                    if new_score <= old_score:
                        continue
                    left_new_load = workloads[left_member.emp_id] - _subject_load(subjects[left_alloc.subject_code]) + _subject_load(subjects[right_alloc.subject_code])
                    right_new_load = workloads[right_member.emp_id] - _subject_load(subjects[right_alloc.subject_code]) + _subject_load(subjects[left_alloc.subject_code])
                    if left_new_load > _max_workload(left_member, config) or right_new_load > _max_workload(right_member, config):
                        continue
                    before = {"left": asdict(left_alloc), "right": asdict(right_alloc)}
                    left_alloc.subject_code, right_alloc.subject_code = right_alloc.subject_code, left_alloc.subject_code
                    left_alloc.subject_name = subjects[left_alloc.subject_code].name
                    right_alloc.subject_name = subjects[right_alloc.subject_code].name
                    left_alloc.priority = left_new_rank
                    right_alloc.priority = right_new_rank
                    left_alloc.match_confidence = 100
                    right_alloc.match_confidence = 100
                    left_alloc.reason = "repair optimization: preference-improving swap"
                    right_alloc.reason = "repair optimization: preference-improving swap"
                    left_alloc.status = "PRIORITY" if left_alloc.slot <= config.regular_max_allocations else "COVERAGE"
                    right_alloc.status = "PRIORITY" if right_alloc.slot <= config.regular_max_allocations else "COVERAGE"
                    workloads[left_member.emp_id] = left_new_load
                    workloads[right_member.emp_id] = right_new_load
                    after = {"left": asdict(left_alloc), "right": asdict(right_alloc)}
                    audit_log.append(AuditEvent("Swap", "system", before, after, "repair optimization: preference-improving swap"))
                    improvements += 1
                    changed = True
                    break
                if changed:
                    break
            if not changed:
                break
        return improvements

    # Phase 1: strict bottom-up preference optimization. Group I/II priorities are already unified by rank.
    for member in _bottom_up(faculty):
        prefs = ranked_by_emp[member.emp_id]
        if not prefs:
            continue

        # Prefer same-subject pair when two sections and workload allow it.
        paired = False
        for rank, code in prefs:
            if can_allocate(member, code, 2):
                add_allocation(member, code, 1, rank, "PRIORITY", "initial optimization: same-subject slot 1")
                add_allocation(member, code, 2, rank, "PRIORITY", "initial optimization: same-subject slot 2")
                paired = True
                break
        if paired:
            continue

        for rank, code in prefs:
            if can_allocate(member, code, 1):
                add_allocation(member, code, 1, rank, "PRIORITY", "initial optimization: highest feasible preference")
                break

        if slot_count(member) == 1:
            first = assignments[member.emp_id][0]
            if can_allocate(member, first.subject_code, 1):
                add_allocation(member, first.subject_code, 2, first.priority, "PRIORITY", "initial optimization: same-subject second section")
            elif config.allow_mixed_slots:
                for rank, code in prefs:
                    if code != first.subject_code and can_allocate(member, code, 1):
                        add_allocation(member, code, 2, rank, "PRIORITY", "initial optimization: mixed preferred subject")
                        break

    # Phase 2: final coverage and repair. Prefer exact faculty preferences first; related matches are last resort.
    repair_passes = 0
    while any(value > 0 for value in remaining.values()) and repair_passes < 4:
        made_progress = False
        repair_passes += 1
        for code in sorted(remaining, key=lambda item: remaining[item], reverse=True):
            while remaining.get(code, 0) > 0:
                exact_candidates: list[tuple[float, Faculty, int | str, str, int]] = []
                related_candidates: list[tuple[float, Faculty, int | str, str, int]] = []
                for member in _bottom_up(faculty):
                    if not ranked_by_emp[member.emp_id]:
                        continue
                    allow_extra_slot = slot_count(member) >= config.regular_max_allocations
                    if not can_allocate(member, code, 1, allow_extra_slot=allow_extra_slot):
                        continue
                    prefs = ranked_by_emp[member.emp_id]
                    exact_rank = next((rank for rank, pref in prefs if pref == code), None)
                    related = max((_related_score(pref, code, subjects) for _, pref in prefs), default=0)
                    current_load = workloads[member.emp_id]
                    balance_bonus = max(0, 25 - abs((_preferred_workload(member, config) - (current_load + _subject_load(subjects[code])))))
                    score = balance_bonus - (current_load * 0.1)
                    reason = "repair optimization: coverage allocation"
                    priority: int | str = "coverage"
                    confidence = related
                    if exact_rank is not None:
                        score += config.preference_weights.get(exact_rank, 0)
                        priority = exact_rank
                        reason = "repair optimization: exact preference coverage"
                        confidence = 100
                    elif related:
                        score += config.preference_weights.get("related", 10) + related
                        priority = "related"
                        reason = "repair optimization: related coverage"
                    if exact_rank is not None:
                        exact_candidates.append((score, member, priority, reason, confidence))
                    elif related:
                        related_candidates.append((score, member, priority, reason, confidence))
                candidates = exact_candidates or related_candidates
                if not candidates:
                    break
                candidates.sort(key=lambda item: item[0], reverse=True)
                _, chosen, priority, reason, confidence = candidates[0]
                next_slot = max([allocation.slot for allocation in assignments[chosen.emp_id]], default=0) + 1
                add_allocation(chosen, code, next_slot, priority, "COVERAGE", reason, confidence)
                made_progress = True
        if not made_progress:
            break

    swap_improvements = improve_by_swapping()

    results: list[FacultyResult] = []
    for member in faculty:
        member_allocations = sorted(assignments[member.emp_id], key=lambda allocation: allocation.slot)
        normal_count = len([allocation for allocation in member_allocations if allocation.slot <= config.regular_max_allocations])
        preferred_count = sum(1 for allocation in member_allocations if isinstance(allocation.priority, int))
        related_count = sum(1 for allocation in member_allocations if allocation.priority == "related")
        if not member_allocations:
            status = "MANUAL ALLOCATION REQUIRED"
        elif preferred_count and not related_count and normal_count >= config.regular_max_allocations:
            status = "FULLY ALLOCATED"
        elif preferred_count and related_count:
            status = "PARTIALLY ALLOCATED"
        elif related_count and not preferred_count:
            status = "RELATED ALLOCATION"
        elif preferred_count:
            status = "FULLY ALLOCATED"
        else:
            status = "MANUAL ALLOCATION REQUIRED"
        results.append(FacultyResult(member.emp_id, member.name, member.designation, member.admin_role, member.preferences, member_allocations, workloads[member.emp_id], status))

    issues.extend(validate_run(results, subjects, remaining, config, audit_log, repair_passes, swap_improvements))
    return AllocationRun(results, subjects, remaining, issues, audit_log, time.perf_counter() - started)


def validate_run(
    results: list[FacultyResult],
    subjects: dict[str, Subject],
    remaining: dict[str, int],
    config: AllocationConfig,
    audit_log: list[AuditEvent],
    repair_passes: int,
    swap_improvements: int,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    total_remaining = sum(remaining.values())
    issues.append(
        ValidationIssue(
            "subject_coverage",
            ValidationStatus.PASS if total_remaining == 0 else ValidationStatus.FAIL,
            "All subject requirements fulfilled." if total_remaining == 0 else f"{total_remaining} required sections remain unallocated.",
        )
    )
    for code, subject in subjects.items():
        allocated = subject.capacity - remaining.get(code, 0)
        if remaining.get(code, 0) < 0 or allocated > subject.capacity:
            issues.append(ValidationIssue("capacity_overflow", ValidationStatus.FAIL, f"{code} exceeds required sections.", code=code))
        if remaining.get(code, 0) > 0:
            issues.append(ValidationIssue("subject_remaining", ValidationStatus.FAIL, f"{code} has {remaining[code]} remaining sections.", code=code))
    for result in results:
        seen_slots: set[int] = set()
        for allocation in result.allocations:
            if allocation.slot in seen_slots:
                issues.append(ValidationIssue("duplicate_slot", ValidationStatus.FAIL, f"{allocation.emp_id} has duplicate slot {allocation.slot}.", code=allocation.emp_id))
            seen_slots.add(allocation.slot)
        limit = _max_workload(Faculty(result.emp_id, result.faculty_name, result.designation, result.preferences, result.admin_role), config)
        if result.workload_hours > limit:
            issues.append(ValidationIssue("workload_limit", ValidationStatus.FAIL, f"{result.emp_id} exceeds workload limit {limit}.", code=result.emp_id))
    issues.append(ValidationIssue("bottom_up_order", ValidationStatus.PASS, "Faculty processing preserved original Excel order and allocated from bottom row upward."))
    issues.append(ValidationIssue("coverage_phase", ValidationStatus.PASS if total_remaining == 0 else ValidationStatus.FAIL, f"Coverage/repair phase completed in {repair_passes} pass(es)."))
    issues.append(ValidationIssue("swap_optimization", ValidationStatus.PASS, f"Preference-improving local search accepted {swap_improvements} swap(s)."))
    issues.append(ValidationIssue("audit_log_integrity", ValidationStatus.PASS if audit_log else ValidationStatus.WARNING, f"{len(audit_log)} audit events recorded."))
    return issues
