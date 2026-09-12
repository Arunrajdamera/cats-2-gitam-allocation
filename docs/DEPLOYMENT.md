# Deployment Guide

This project has two supported deployment modes:

- Local development with Docker Compose.
- Production deployment with Vercel for the frontend and Render for the FastAPI backend.

## Local Docker Setup

Prerequisites:

- Docker Desktop
- Git

Run from the project root:

```powershell
cd "C:\Users\admin\OneDrive\Documents\cats 2"
docker compose up --build
```

Open:

- Frontend: `http://localhost:5173`
- API docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

For normal restarts after images are already built:

```powershell
cd "C:\Users\admin\OneDrive\Documents\cats 2"
docker compose up
```

Stop containers:

```powershell
Ctrl + C
docker compose down
```

## Production Frontend: Vercel

Recommended Vercel settings:

| Setting | Value |
| --- | --- |
| Root Directory | `frontend` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

Required environment variable:

```text
VITE_API_URL=https://cats-2-gitam-allocation.onrender.com
```

The frontend currently uses `VITE_API_URL` as the backend base URL. It does not use `/api/*` relative routes.

## Production Backend: Render

Recommended Render settings:

| Setting | Value |
| --- | --- |
| Runtime | Python |
| Root Directory | `backend` |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn app.api.main:app --host 0.0.0.0 --port $PORT` |

Production URL:

```text
https://cats-2-gitam-allocation.onrender.com
```

Health check:

```text
https://cats-2-gitam-allocation.onrender.com/health
```

## Environment And Secrets

Do not commit `.env` files containing real secrets.

For local Docker development, `docker-compose.yml` contains demonstration database credentials. Production database credentials should be configured in the hosting provider's secret manager.

Frontend admin credentials are demonstration-only because they are enforced in the browser. A production version should move admin authentication to the backend using JWT, SSO, or another server-side authentication system.

## Common Issues

### Port 5432 Already Allocated

The local Docker Compose configuration maps PostgreSQL to host port `5433`, which avoids conflicts with another PostgreSQL container already using `5432`.

### Frontend Cannot Reach Backend

Check that `VITE_API_URL` points to the correct backend:

- Local Docker: `http://localhost:8000`
- Production Vercel: `https://cats-2-gitam-allocation.onrender.com`

### Backend Sleeps On Free Hosting

Render free-tier services may sleep after inactivity. The first request can take longer while the service wakes up.
