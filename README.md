# bounswe2026group3
CMPE354 Group 3 repository

## Project Structure

```
bounswe2026group3/
├── backend/        # Django REST API
├── frontend/       # Expo (React Native) mobile app
├── docker-compose.yml
└── .env.example
```

## Quick Start (Docker)

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### 1. Clone the repository
```bash
git clone https://github.com/bounswe/bounswe2026group3.git
cd bounswe2026group3
```

### 2. Set up environment variables
```bash
cp .env.example .env
```
Edit `.env` if needed (defaults work out of the box for local development).

### 3. Start all services
```bash
docker compose up --build
```

This starts:
| Service  | URL                        |
|----------|----------------------------|
| Backend  | http://localhost:8000      |

> **Note:** The database is hosted on Supabase. Set your Supabase credentials in `.env` before starting.

### 4. Stop services
```bash
docker compose down
```

---

## Backend (Django)

### Local development without Docker

#### Prerequisites
- Python 3.12+
- PostgreSQL (or use Docker just for the DB)

#### Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements/dev.txt
cp ../.env.example .env     # then update DB_HOST=localhost
python manage.py migrate
python manage.py runserver
```

#### Run tests
```bash
pytest
```

#### Lint
```bash
flake8 . --max-line-length=120 --exclude=migrations
isort . --check-only
```

---

## CI

GitHub Actions runs on every PR to `main`:
- **Backend Lint** — flake8 + isort
- **Backend Tests** — pytest
- **Docker Build Check** — verifies the image builds successfully
