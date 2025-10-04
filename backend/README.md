# MediSim Backend (Flask)

## Quick Start
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# (optional) copy .env.example to .env and edit values
export FLASK_APP=app.py
python app.py
```

The API listens on `http://localhost:5001`. Configure your frontend `VITE_API_BASE` accordingly.

## Auth Flow (Google)
- Frontend obtains a Google **ID Token** (via Google Identity Services).
- It POSTs `{ id_token, hospital }` to `/api/auth/google-login`.
- Backend verifies the ID token, creates/updates a user, and returns a **JWT** for API access.
- Include `Authorization: Bearer <jwt>` for subsequent requests.

## Endpoints
- `POST /api/auth/google-login` – verify Google token, upsert user, return app JWT
- `GET /api/me` – current user
- `GET /api/threads` – list threads
- `POST /api/threads` – create thread
- `GET /api/threads/<id>` – get thread
- `GET /api/threads/<id>/messages` – list messages
- `POST /api/threads/<id>/messages` – add doctor message and auto patient reply (placeholder)