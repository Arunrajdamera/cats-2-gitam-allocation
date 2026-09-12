from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


NA_VALUES = {"", "#N/A", "N/A", "NA", "nan", "None"}


class ValidationStatus(str, Enum):
    PASS = "PASS"
    WARNING = "WARNING"
    FAIL = "FAIL"


class AllocationStatus(str, Enum):
    FULLY_ALLOCATED = "FULLY ALLOCATED"
    PARTIALLY_ALLOCATED = "PARTIALLY ALLOCATED"
    RELATED_ALLOCATION = "RELATED ALLOCATION"
    MANUAL_REQUIRED = "MANUAL ALLOCATION REQUIRED"
    COVERAGE = "COVERAGE"
    PRIORITY = "PRIORITY"


@dataclass(slots=True)
class ValidationIssue:
    check: str
    status: ValidationStatus
    message: str
    row: int | None = None
    code: str | None = None


@dataclass(slots=True)
class Faculty:
    emp_id: str
    name: str
    designation: str
    preferences: list[str | None]
    admin_role: str = ""
    source_row: int | None = None
    preference_ranks: list[int | None] = field(default_factory=list)

    @property
    def is_admin(self) -> bool:
        return bool(self.admin_role)


@dataclass(slots=True)
class Subject:
    code: str
    name: str
    capacity: int
    credits: int = 3
    source_row: int | None = None
    semester: str = ""
    category: str = ""
    l: int = 0
    t: int = 0
    p: int = 0
    weekly_classes: int = 0
    instructor_workload: int = 0
    partner_workload: int = 0
    faculty_requirement: int = 0


@dataclass(slots=True)
class Allocation:
    emp_id: str
    faculty_name: str
    designation: str
    subject_code: str
    subject_name: str
    slot: int
    priority: int | str
    status: str
    workload_hours: int
    reason: str = ""
    admin_role: str = ""
    match_confidence: int = 100
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(slots=True)
class FacultyResult:
    emp_id: str
    faculty_name: str
    designation: str
    admin_role: str
    preferences: list[str | None]
    allocations: list[Allocation]
    workload_hours: int
    status: str


@dataclass(slots=True)
class AuditEvent:
    action_type: str
    admin_user: str
    before_value: Any
    after_value: Any
    reason: str
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(slots=True)
class AllocationConfig:
    hierarchy_mode: str = "bottom-up"
    workload_limits: dict[str, int] = field(
        default_factory=lambda: {
            "Professor": 6,
            "Associate Professor": 10,
            "Assistant Professor": 14,
        }
    )
    preference_weights: dict[int | str, int] = field(
        default_factory=lambda: {1: 100, 2: 75, 3: 50, 4: 25, "related": 10, "coverage": 1, "manual": -50}
    )
    admin_max_allocations: int = 1
    regular_max_allocations: int = 2
    prefer_same_subject_slot_2: bool = True
    strict_same_subject_slots: bool = True
    enable_admin_access: bool = True
    max_supplemental_allocations: int = 10
    duplicate_subject_policy: str = "reject"
    preserve_excel_bottom_up: bool = True
    allow_mixed_slots: bool = True
    preferred_workload: dict[str, int] = field(
        default_factory=lambda: {
            "Professor": 6,
            "Associate Professor": 10,
            "Assistant Professor": 10,
        }
    )
    minimum_workload: dict[str, int] = field(
        default_factory=lambda: {
            "Professor": 0,
            "Associate Professor": 0,
            "Assistant Professor": 0,
        }
    )
    subject_families: dict[str, list[str]] = field(
        default_factory=lambda: {
            "AI Family": ["ARTIFICIAL INTELLIGENCE", "MACHINE LEARNING", "DEEP LEARNING", "DATA MINING", "NATURAL LANGUAGE"],
            "Security Family": ["CRYPTOGRAPHY", "NETWORK SECURITY", "CYBER SECURITY", "DIGITAL FORENSICS"],
            "Systems Family": ["OPERATING SYSTEMS", "DISTRIBUTED SYSTEMS", "CLOUD COMPUTING"],
            "Programming Family": ["PROGRAMMING", "DATA STRUCTURES", "ALGORITHMS"],
        }
    )
    admin_access_roles: list[str] = field(
        default_factory=lambda: [
            "Director",
            "HOD",
            "Assistant Director",
            "Program Coordinator",
            "Dean",
            "Senior Professor",
        ]
    )


@dataclass(slots=True)
class AllocationRun:
    faculty: list[FacultyResult]
    subjects: dict[str, Subject]
    remaining_capacity: dict[str, int]
    validation: list[ValidationIssue]
    audit_log: list[AuditEvent]
    runtime_seconds: float
