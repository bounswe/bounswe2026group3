## Description

Set up the mono-repo Docker environment, backend project configuration, Supabase database connection, and CI pipeline so every team member can run the full backend stack locally with a single command.

## Due Time

Completed

## Acceptance Criteria

- `docker-compose.yml` added at root — spins up backend service; DB is Supabase
- `backend/Dockerfile` added — Python 3.12-slim, dependencies installed, runs via gunicorn
- `backend/entrypoint.sh` added — runs migrations before starting the server
- Django settings configured with PostgreSQL, JWT, CORS, bcrypt — all secrets via environment variables (`python-decouple`)
- `requirements/base.txt`, `dev.txt`, `prod.txt` added with pinned dependencies
- Root `.env.example` and `backend/.env.example` added with all required environment variables
- `.gitignore` added covering Python, Django, Node, IDE and OS files
- GitHub Actions CI added — Docker build check on every PR to `main`
- `README.md` updated with step-by-step build & run instructions
- `AppConfig` defined for all apps (`authority`, `interactions`, `map`, `notifications`, `reports`, `routing`, `trust_scores`)
- Supabase connection established and verified — `python manage.py migrate` runs successfully
- `GET /health/` endpoint added — returns `{"status": "ok", "db": "connected"}` or 503 on failure
- `users` table schema aligned: `status` → `account_status`, `trust_score` → `reputation_points`, `role` column added
- `reports.id` changed from bigint to UUID; FK columns in `photos`, `interactions`, `status_changes` updated accordingly
- `report-photos` public bucket created in Supabase Storage

## Reviewer

@AliAkkaya

## Notes

- DB is Supabase (Southeast Asia – Singapore). Connection goes through the pooler: `aws-1-ap-southeast-1.pooler.supabase.com`. Direct host (`db.*.supabase.co`) does not resolve — use pooler URL in `.env`.
- Lint and test CI jobs are omitted for now; will be re-added once model/migration structure is stabilised across branches.
- Migration files are in `.gitignore` (`backend/apps/*/migrations/`) — each developer runs `migrate` locally against Supabase.
- `auth.users` (Supabase built-in) and `public.users` (Django) coexist in the DB — no conflict, Django only touches `public.users`.
