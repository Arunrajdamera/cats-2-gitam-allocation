from __future__ import annotations

from .schemas import AllocationRun, AuditEvent


def record_manual_event(run: AllocationRun, action_type: str, admin_user: str, before: object, after: object, reason: str) -> None:
    run.audit_log.append(AuditEvent(action_type, admin_user, before, after, reason))


def validate_manual_correction_row(row: dict[str, object]) -> list[str]:
    errors: list[str] = []
    if not str(row.get("EMP ID") or row.get("emp_id") or "").strip():
        errors.append("EMP ID is required.")
    if not str(row.get("New Subject") or row.get("new_subject") or "").strip():
        errors.append("New Subject is required.")
    if not str(row.get("Reason") or row.get("reason") or "").strip():
        errors.append("Reason is required.")
    return errors

