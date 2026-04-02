## Description
Set up Docker environment, project configuration, and CI pipeline so the backend stack can be run locally with a single command.

## Type of Change
- [x] `chore` — maintenance / configuration

## Changes
- Added root `docker-compose.yml` — spins up the backend service; DB is Supabase (configured separately by Ali)
- Added `backend/Dockerfile` — Python 3.12-slim image, installs dependencies, runs via gunicorn
- Added `backend/entrypoint.sh` — runs `migrate` before starting the server
- Added `backend/config/settings.py` — Django settings with PostgreSQL, JWT, and CORS support; all secrets read from environment variables via `python-decouple`
- Added `backend/config/urls.py`, `backend/config/wsgi.py`, `backend/manage.py` — Django project entry points
- Added `backend/requirements/base.txt`, `dev.txt`, `prod.txt` — pinned dependencies (Django, DRF, simplejwt, psycopg2, gunicorn, pytest, flake8, isort…)
- Added `backend/pytest.ini` and `backend/conftest.py` — pytest configuration
- Added root `.env.example` and `backend/.env.example` — templates with all required environment variables
- Added `.gitignore` — covers Python, Django, Node, IDE and OS files
- Added `.github/workflows/ci.yml` — GitHub Actions CI that checks Docker build on every PR to main
- Updated `README.md` — step-by-step instructions to clone, configure env, and run with `docker compose up --build`

## How to Test
1. Copy env file: `cp .env.example .env` and fill in Supabase credentials
2. Run: `docker compose up --build`
3. Backend should be available at `http://localhost:8000`

## Screenshots (if applicable)
N/A — infrastructure only, no UI changes.

## Checklist
- [x] Commit messages follow `<type>(<scope>): <subject>` format
- [ ] Branch is up to date with the target branch
- [ ] No self-merge — at least 1 reviewer assigned
- [ ] Conflicts resolved by PR author

## Related Issue
- Closes #1

## Notes
- Database is Supabase — Ali will provide the connection credentials.
- Lint and test CI jobs are left out for now; will be added once DB is set up.
