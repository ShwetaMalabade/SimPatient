# MediSim Backend (Flask)

## Quick Start
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Set up environment variables (see Configuration section below)
export FLASK_APP=app.py
python app.py
```

The API listens on `http://localhost:5001`. Configure your frontend `VITE_API_BASE` accordingly.

## Configuration

### Required Environment Variables

```bash
# Flask Configuration
export SECRET_KEY=your-secret-key-here
export FRONTEND_ORIGIN=http://localhost:5173
export PORT=5001

# Google OAuth (optional)
export GOOGLE_CLIENT_ID=your-google-client-id

# Vertex AI Configuration (Required for AI Patient Responses)
export GCP_PROJECT_ID=your-gcp-project-id
export GCP_LOCATION=us-central1  # or your preferred region
export VERTEX_ENDPOINT_ID=your-vertex-ai-endpoint-id
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
```

### Setting up Vertex AI

1. **Get your GCP Project ID**: This is your Google Cloud project ID where you deployed the fine-tuned model
2. **Get your Endpoint ID**: 
   - Go to Vertex AI Console > Endpoints
   - Find your deployed fine-tuned Gemini model
   - Copy the endpoint ID (the numeric part at the end of the endpoint resource name)
3. **Set the location**: Usually `us-central1` or the region where you deployed your model
4. **Service Account Key**: Use the provided `gen-lang-client-0113614552-1455af07cb6a.json` file or set the path to your own service account key

### How the AI Integration Works

- When a doctor sends a message, the backend automatically generates a patient response
- The fine-tuned Gemini model receives the **full conversation history** for context-aware responses
- The conversation is formatted as:
  ```
  Conversation history:
  Doctor: <previous message>
  Patient: <previous response>
  ...
  Doctor: <current message>
  Patient:
  ```
- The model generates realistic patient responses based on the training data

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