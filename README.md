# GITAM CSE Automated Faculty Subject Allocation System

Production-grade scaffold for automated faculty subject allocation using Google Forms preference exports and semester-wise subject requirements.

## What Is Included

- Python allocation core with validation, nearest match, admin access, audit events, Excel export, and PDF summary export.
- FastAPI endpoints for separate uploads, combined workbook upload, allocation, results, statistics, validation, audit logs, overrides, swaps, corrections, and exports.
- PostgreSQL schema for faculty, subjects, runs, allocations, validation results, and audit logs.
- React TypeScript frontend with upload flow, allocation controls, AG Grid results, validation dashboard, and report downloads.
- Docker Compose setup for PostgreSQL, API, and frontend.
- Source verification script for the supplied workbooks.

## Verified Source Notes

- `demo.xlsx` contains 158 faculty rows in `Final Faculty Allocation`.
- `TT Subject Requirement.xlsx` uses `Course Codes`, `Courses`, and `Instructors`.
- The supplied subject sheet contains duplicate subject codes. Strict production mode rejects these; admin-reviewed mode can merge duplicate capacities.
- The downloaded legacy `allocator_engine.py` misreads the subject requirement workbook and loads only a small subset, so it is not reliable as the production engine.

## Run Source Verification

```powershell
$env:PYTHONPATH='backend'
python scripts/verify_sources.py --faculty "C:\Users\admin\OneDrive\Desktop\demo.xlsx" --subjects "C:\Users\admin\OneDrive\Desktop\TT Subject Requirement.xlsx" --duplicate-policy merge
```

Outputs are written to `sample_data/`:

- `verification_summary.json`
- `verified_allocation_report.xlsx`
- `verified_allocation_summary.pdf`

## Run The App

```powershell
docker compose up --build
```

Frontend: `http://localhost:5173`

API docs: `http://localhost:8000/docs`

## Test Core Logic

```powershell
$env:PYTHONPATH='backend'
python -m unittest discover backend/tests
```
