# MediSim Frontend (React + Vite + Tailwind)

## Quick Start
1) Copy `.env.example` to `.env` and fill in `VITE_GOOGLE_CLIENT_ID` and `VITE_API_BASE`.
2) Install deps and run:
```bash
npm install
npm run dev
```

The login page uses Google Identity Services and asks for your hospital before proceeding.
After login, you get a ChatGPT-style UI with a sidebar, profile at top-left, New Chat,
and a chat area. Messages are stored server-side (Flask API).

## Notes
- This is a starter UI. Patient replies are placeholder (echo-like) until you plug in models.
- Tailwind is pre-configured for a clean medical theme.