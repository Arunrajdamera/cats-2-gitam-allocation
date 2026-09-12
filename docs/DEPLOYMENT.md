# Deployment Guide

1. Install Docker Desktop.
2. From the project root, run `docker compose up --build`.
3. Open the frontend at `http://localhost:5173`.
4. Open API docs at `http://localhost:8000/docs`.
5. Upload the faculty preference workbook and the subject requirement workbook.
6. Keep `duplicate_policy=reject` for strict production validation. Use `merge` only when an admin has reviewed duplicate subject rows and wants capacities combined.

Production notes:

- Replace the demo PIN flow with SSO/JWT provider integration.
- Set a strong PostgreSQL password and move credentials to secrets.
- Store uploaded files and generated reports in durable object storage.
- Keep every manual override reason mandatory to preserve audit quality.

