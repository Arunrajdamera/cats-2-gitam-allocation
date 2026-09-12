# System Architecture

This document describes the current working architecture of the GITAM CSE Automated Faculty Allocation System.

## High-Level Architecture

```text
+-------------------------+       +-------------------------+
| React / Vite Frontend   | <---> | FastAPI Backend API     |
| Vercel deployment       |       | Render deployment       |
+-------------------------+       +-------------------------+
            |                                |
            |                                v
            |                    +-------------------------+
            |                    | Core Processing Modules |
            |                    | Parsers / Validation    |
            |                    | Allocation / Reports    |
            |                    +-------------------------+
            |                                |
            v                                v
+-------------------------+       +-------------------------+
| Browser Downloads       |       | PostgreSQL Schema      |
| Excel / PDF Reports     |       | Docker local support   |
+-------------------------+       +-------------------------+
```

## Main Components

| Component | Responsibility |
| --- | --- |
| Frontend | Upload workbooks, run allocation, show dashboard, analytics, validation, audit logs, reports, and admin UI. |
| FastAPI API | Receives uploads, stores runtime state, exposes allocation results, statistics, validation, audit, and exports. |
| Parser Layer | Reads Excel files, normalizes subject codes and faculty preferences, detects duplicate or invalid records. |
| Validation Layer | Produces `PASS`, `WARNING`, and `FAIL` checks for data quality and allocation consistency. |
| Allocation Engine | Processes faculty in configured order, assigns subjects by preference and capacity, repairs coverage, and improves assignments through swaps. |
| Reports Layer | Generates multi-sheet Excel reports and PDF allocation summaries. |
| PostgreSQL Schema | Provides database schema support for deployment/local infrastructure. Current runtime allocation state is held by the API process. |

## Runtime Data Flow

```text
Faculty Preference Workbook
        +
Subject Requirement Workbook
        |
        v
Frontend Upload Module
        |
        v
FastAPI Upload Endpoints
        |
        v
Parser Normalization
        |
        v
Validation Checks
        |
        v
Bottom-Up Allocation
        |
        v
Coverage Repair
        |
        v
Preference-Improving Swap Pass
        |
        v
Results / Statistics / Audit
        |
        v
Dashboard / Analytics / Reports
```

## Allocation Engine Summary

The current allocation engine is implemented in `backend/app/core/allocator.py`.

It uses deterministic optimization logic rather than a machine-learning model. The implementation prioritizes:

1. Complete subject section coverage.
2. Faculty preference satisfaction.
3. Same-subject paired allocation when feasible.
4. Workload limits by designation.
5. Related-subject fallback when exact preferences cannot satisfy coverage.
6. Local swap improvements when they improve preference quality without breaking constraints.

The backend dependency list includes `ortools`, but the inspected current production path is the Python heuristic allocation engine with coverage repair and local swap improvement.

## Deployment Architecture

```text
User Browser
     |
     v
Vercel Frontend
https://cats-2-gitam-allocation.vercel.app
     |
     | VITE_API_URL
     v
Render FastAPI Backend
https://cats-2-gitam-allocation.onrender.com
     |
     v
Excel/PDF generation and API runtime state
```

For local development, Docker Compose runs:

- Frontend on `http://localhost:5173`
- FastAPI backend on `http://localhost:8000`
- PostgreSQL on host port `5433`

## Security Notes

- Frontend admin authentication is suitable for demonstration only.
- Production admin authentication should move to backend-issued sessions, JWT, or institutional SSO.
- CORS is currently permissive for deployment simplicity and should be restricted before sensitive production use.
- Environment files containing secrets should not be committed.
