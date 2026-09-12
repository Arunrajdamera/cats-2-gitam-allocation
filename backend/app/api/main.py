from __future__ import annotations

import tempfile
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.core import AllocationConfig, build_statistics, export_excel, export_pdf_summary, load_faculty_preferences, load_subject_requirements, run_allocation


app = FastAPI(title="GITAM CSE Faculty Subject Allocation API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

STATE: dict[str, object] = {
    "faculty": None,
    "subjects": None,
    "run": None,
    "config": AllocationConfig(),
    "faculty_issues": [],
    "subject_issues": [],
}


async def _save_upload(upload: UploadFile) -> Path:
    suffix = Path(upload.filename or "upload.xlsx").suffix or ".xlsx"
    target = Path(tempfile.mkdtemp()) / f"upload{suffix}"
    target.write_bytes(await upload.read())
    return target


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upload/faculty")
async def upload_faculty(file: UploadFile = File(...)) -> dict[str, object]:
    path = await _save_upload(file)
    faculty, issues = load_faculty_preferences(path)
    STATE["faculty"] = faculty
    STATE["faculty_issues"] = issues
    return {"faculty_count": len(faculty), "issues": [asdict(issue) for issue in issues]}


@app.post("/upload/subjects")
async def upload_subjects(file: UploadFile = File(...), duplicate_policy: str = "reject") -> dict[str, object]:
    path = await _save_upload(file)
    config = AllocationConfig(duplicate_subject_policy=duplicate_policy)
    subjects, issues = load_subject_requirements(path, config)
    STATE["subjects"] = subjects
    STATE["config"] = config
    STATE["subject_issues"] = issues
    return {"subject_count": len(subjects), "section_count": sum(subject.capacity for subject in subjects.values()), "issues": [asdict(issue) for issue in issues]}


@app.post("/upload/combined")
async def upload_combined(file: UploadFile = File(...), duplicate_policy: str = "merge") -> dict[str, object]:
    path = await _save_upload(file)
    config = AllocationConfig(duplicate_subject_policy=duplicate_policy)
    faculty, faculty_issues = load_faculty_preferences(path)
    subjects, subject_issues = load_subject_requirements(path, config)
    STATE["faculty"] = faculty
    STATE["subjects"] = subjects
    STATE["config"] = config
    STATE["faculty_issues"] = faculty_issues
    STATE["subject_issues"] = subject_issues
    return {
        "faculty_count": len(faculty),
        "subject_count": len(subjects),
        "section_count": sum(subject.capacity for subject in subjects.values()),
        "issues": [asdict(issue) for issue in faculty_issues + subject_issues],
    }


@app.post("/allocation/run")
def run(hierarchy_mode: str = "bottom-up", duplicate_policy: str = "reject") -> dict[str, object]:
    faculty = STATE.get("faculty")
    subjects = STATE.get("subjects")
    if not faculty or not subjects:
        raise HTTPException(400, "Upload faculty and subject files before running allocation.")
    config = AllocationConfig(hierarchy_mode=hierarchy_mode, duplicate_subject_policy=duplicate_policy)
    input_issues = list(STATE.get("faculty_issues", [])) + list(STATE.get("subject_issues", []))
    allocation_run = run_allocation(faculty, subjects, config, input_issues)
    STATE["run"] = allocation_run
    return {"statistics": build_statistics(allocation_run), "validation": [asdict(issue) for issue in allocation_run.validation]}


@app.get("/results")
def results() -> dict[str, object]:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    return {
        "faculty": [
            {
                "emp_id": item.emp_id,
                "faculty_name": item.faculty_name,
                "designation": item.designation,
                "admin_role": item.admin_role,
                "status": item.status,
                "workload_hours": item.workload_hours,
                "allocations": [asdict(allocation) for allocation in item.allocations],
            }
            for item in allocation_run.faculty
        ]
    }


@app.get("/statistics")
def statistics() -> dict[str, object]:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    return build_statistics(allocation_run)


@app.get("/validation")
def validation() -> dict[str, object]:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    return {"checks": [asdict(issue) for issue in allocation_run.validation]}


@app.get("/audit")
def audit() -> dict[str, object]:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    return {"events": [asdict(event) for event in allocation_run.audit_log]}


@app.post("/override")
def create_override(emp_id: str, subject_code: str, reason: str, admin_user: str = "admin") -> dict[str, str]:
    return {"status": "queued", "action": "override", "emp_id": emp_id, "subject_code": subject_code, "reason": reason, "admin_user": admin_user}


@app.post("/swap")
def create_swap(emp_id_a: str, emp_id_b: str, reason: str, admin_user: str = "admin") -> dict[str, str]:
    return {"status": "queued", "action": "swap", "emp_id_a": emp_id_a, "emp_id_b": emp_id_b, "reason": reason, "admin_user": admin_user}


@app.post("/manual-correction")
def create_manual_correction(emp_id: str, new_subject: str, reason: str, admin_user: str = "admin") -> dict[str, str]:
    return {"status": "queued", "action": "manual_correction", "emp_id": emp_id, "new_subject": new_subject, "reason": reason, "admin_user": admin_user}


@app.get("/export/excel")
def export_excel_endpoint() -> FileResponse:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    path = export_excel(allocation_run, Path(tempfile.mkdtemp()) / "allocation_report.xlsx")
    return FileResponse(path, filename="allocation_report.xlsx")


@app.get("/export/pdf")
def export_pdf_endpoint() -> FileResponse:
    allocation_run = STATE.get("run")
    if not allocation_run:
        raise HTTPException(404, "No allocation run is available.")
    path = export_pdf_summary(allocation_run, Path(tempfile.mkdtemp()) / "allocation_summary.pdf")
    return FileResponse(path, filename="allocation_summary.pdf")
