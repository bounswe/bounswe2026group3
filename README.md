# AccessMap — Group 3

AccessMap is a community-driven accessibility reporting platform that helps people with mobility impairments navigate their surroundings safely. Users can report, verify, and track physical obstacles (broken ramps, blocked paths, road construction, etc.) on an interactive map, and get pedestrian routes that actively avoid verified hazards. Built for CMPE354 Software Engineering at Bogazici University.

## Deployment

| Service | URL |
|---|---|
| Web App | https://bounswe2026group3.vercel.app |
| Backend API | https://bounswe2026group3-2.onrender.com |
| API Docs | https://bounswe2026group3-2.onrender.com/api/schema/swagger-ui/ |

> The backend runs on Render's free tier and may take ~30 seconds to wake up after inactivity.

## Quick Start (Deployed)

Visit the web app and use one of the test accounts from `credentials.pdf`. No local setup needed.

## Local Setup with Docker

**Requirements:** Docker, Docker Compose

```bash
git clone https://github.com/bounswe/bounswe2026group3.git
cd bounswe2026group3
cp .env.example .env
# Fill in Supabase and DB credentials in .env
docker compose up --build
```

Backend available at http://localhost:8000.

## Backend Development (Django)

**Requirements:** Python 3.12+, PostgreSQL

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements/dev.txt
cp ../.env.example ../.env  # configure credentials
python manage.py migrate
python manage.py runserver
```

**Tests & linting:**
```bash
pytest
flake8 . --max-line-length=120 --exclude=migrations
isort . --check-only
```

## Frontend Development (Expo / React Native)

**Requirements:** Node.js 18+

```bash
cd frontend
npm install
npx expo start
```

- Press `w` for web browser
- Press `a` for Android emulator
- Scan the QR code with Expo Go for a physical device

**Environment variable for native/local dev** — create `frontend/.env`:
```
EXPO_PUBLIC_API_URL=https://bounswe2026group3-2.onrender.com
```

Without this, the native app falls back to `http://localhost:8000` which won't reach the backend on a real device.

## Environment Variables

| Variable | Description |
|---|---|
| `SECRET_KEY` | Django secret key |
| `DEBUG` | `True` for development |
| `ALLOWED_HOSTS` | Comma-separated allowed hosts |
| `DB_HOST` | Supabase PostgreSQL host |
| `DB_PORT` | Database port (default 5432) |
| `DB_NAME` | Database name |
| `DB_USER` | Database user |
| `DB_PASSWORD` | Database password |
| `CORS_ALLOWED_ORIGINS` | Allowed CORS origins |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key |
| `SUPABASE_PHOTOS_BUCKET` | Supabase storage bucket for photos |

## Platform Features

**For citizens:**
- Interactive map showing accessibility obstacles with status indicators
- Report obstacles with photos, category, location, and indoor/outdoor context
- Upvote reports to help verify them; flag low-quality or false reports
- Pedestrian route planning that automatically avoids verified obstacles
- Confirm that a resolved obstacle has been fixed (community validation)
- Discussion comments on each report
- Save favourite places
- Push notifications for report status changes

**For trusted contributors & authorities:**
- Authority dashboard to review and resolve reported obstacles
- Mark reports as resolved with repair photos and notes
- Trust score system — active contributors earn elevated status

**Role system:** Guest → Citizen → Trusted Contributor → Authority → Admin

## Tech Stack

**Backend:** Python 3.12, Django 4.2, Django REST Framework, PostgreSQL (Supabase), JWT auth (SimpleJWT), Valhalla routing API

**Frontend:** React Native 0.81, Expo SDK 54, TypeScript, Expo Router, React Leaflet (web map), expo-location

**Infrastructure:** Render (backend), Vercel (web frontend), Supabase (database + photo storage), GitHub Actions (CI)

## Key API Endpoints

| Prefix | Description |
|---|---|
| `/api/auth/` | Register, login, logout, token refresh, password reset |
| `/api/users/me` | Current user profile |
| `/api/reports/` | Create obstacle reports, upvote, flag, confirm resolution, comments |
| `/api/map/obstacles/` | List and detail view of obstacles (bbox filter) |
| `/api/map/search` | Location search (campus + Nominatim) |
| `/api/routing/calculate` | Pedestrian route with obstacle avoidance |
| `/api/authority/` | Authority dashboard and report resolution |
| `/api/notifications/` | User notifications |
| `/api/places/` | Saved places CRUD |

## Project Structure

```
bounswe2026group3/
├── backend/               # Django REST API
│   ├── apps/
│   │   ├── users/         # Auth & user management
│   │   ├── reports/       # Obstacle reports & interactions
│   │   ├── map/           # Map obstacle queries
│   │   ├── routing/       # Pedestrian route calculation
│   │   ├── authority/     # Authority dashboard
│   │   ├── notifications/ # Push notifications
│   │   ├── places/        # Saved places
│   │   └── trust_scores/  # Trust score system
│   └── requirements/
├── frontend/              # Expo React Native app
│   ├── app/               # Expo Router screens
│   │   ├── tabs/          # Main tab screens (map, report, notifications, profile)
│   │   ├── report/        # Report detail screen
│   │   ├── authority/     # Authority screens
│   │   └── auth/          # Auth screens
│   └── src/
│       ├── api/           # API client functions
│       ├── components/    # Reusable UI components
│       ├── constants/     # Theme, colours, accessibility standards
│       └── services/      # Auth token management
└── docker-compose.yml
```

## Git Workflow

Branches follow `<type>/<description>` (e.g. `fix/route-avoidance`, `feature/confirm-resolution`). Commits use conventional format: `<type>(<scope>): <description>`. All changes to `main` go through a pull request with at least one reviewer approval.

## CI

GitHub Actions runs on every PR to `main`:
- **Backend Lint** — flake8 + isort
- **Backend Tests** — pytest
- **Docker Build Check** — verifies the image builds successfully

## Documentation

- **Wiki:** GitHub repository wiki for requirements, milestones, and meeting notes
- **API schema:** `/api/schema/swagger-ui/` on the running backend
