import os
import datetime as dt
from functools import wraps
from typing import Optional, List
from io import BytesIO

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base, relationship
import jwt

# Google ID token verification (optional in dev)
from google.oauth2 import id_token
from google.auth.transport import requests as grequests

# Gemini AI
from google import genai
from google.genai.types import Content, Part, GenerateContentConfig

# ElevenLabs
from elevenlabs.client import ElevenLabs
from elevenlabs import VoiceSettings

SYSTEM_INSTRUCTION = (
    "You are role-playing a patient in a clinical interview. "
    "Stay consistent with earlier answers. Do not provide diagnoses or medical advice. "
    "Only speak as the patient."
)

SECRET = os.environ.get("SECRET_KEY", "dev-secret-change-me")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")

# Vertex AI Configuration
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get(
    "GOOGLE_APPLICATION_CREDENTIALS",
    "/Users/harsha/Documents/HackRU F25 /medihelp/backend/gen-lang-client-0113614552-1455af07cb6a.json"
)
TUNED_MODEL = os.environ.get("TUNED_MODEL", "")

# ElevenLabs Configuration
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")

# Initialize Gemini client
client = genai.Client(
    vertexai=True,
    project=GCP_PROJECT_ID,
    location=GCP_LOCATION,
)

# Initialize ElevenLabs client
elevenlabs_client = None
if ELEVENLABS_API_KEY:
    elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": [FRONTEND_ORIGIN]}}, supports_credentials=False)

# --- DB setup (SQLite) ---
Base = declarative_base()
engine = create_engine("sqlite:///medsim.db", echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    picture = Column(String, nullable=True)
    hospital = Column(String, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    last_login = Column(DateTime, default=dt.datetime.utcnow)

    threads = relationship("Thread", back_populates="user", cascade="all,delete")

class Thread(Base):
    __tablename__ = "threads"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False, default="New Patient Session")
    status = Column(String, nullable=False, default="open")
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="threads")
    messages = relationship("Message", back_populates="thread", cascade="all,delete", order_by="Message.created_at")
    feedback = relationship("Feedback", back_populates="thread", uselist=False, cascade="all,delete")

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("threads.id"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    thread = relationship("Thread", back_populates="messages")

class Feedback(Base):
    __tablename__ = "feedback"
    id = Column(Integer, primary_key=True)
    thread_id = Column(Integer, ForeignKey("threads.id"), nullable=False, unique=True)
    overall_score = Column(Integer, nullable=False)
    rubric_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    thread = relationship("Thread", back_populates="feedback")

Base.metadata.create_all(engine)

# --- Auth helpers ---
def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "exp": dt.datetime.utcnow() + dt.timedelta(days=7)
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")

def current_user(session) -> Optional[User]:
    auth = request.headers.get("Authorization", "")
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
        try:
            data = jwt.decode(token, SECRET, algorithms=["HS256"])
            uid = int(data["sub"])
            user = session.get(User, uid)
            return user
        except Exception:
            return None
    return None

def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        session = SessionLocal()
        try:
            user = current_user(session)
            if not user:
                return jsonify({"message": "Unauthorized"}), 401
            request.user = user
            request.dbs = session
            return fn(*args, **kwargs)
        finally:
            session.close()
    return wrapper

# --- Utility: feedback generator ---
def _score_section(texts: List[str], keywords: List[str]) -> int:
    text = " ".join(texts).lower()
    hits = sum(1 for k in keywords if k in text)
    return max(0, min(5, hits))

def generate_feedback_for_thread(messages: List[Message]) -> dict:
    doc = [m.content for m in messages if m.role == "doctor"]
    pat = [m.content for m in messages if m.role == "patient"]

    sections = {
        "history": {
            "title": "History Taking",
            "score": _score_section(doc, ["onset", "duration", "location", "severity", "character", "radiate", "better", "worse", "timeline"]),
            "feedback": "Consider OPQRST (onset, provocation, quality, radiation, severity, time) to structure history."
        },
        "red_flags": {
            "title": "Red Flags",
            "score": _score_section(doc, ["fever", "weight loss", "bleeding", "faint", "chest pain", "short of breath", "neurologic"]),
            "feedback": "Good practice to screen for red flags early (e.g., fever, chest pain, syncope)."
        },
        "meds_allergies": {
            "title": "Meds & Allergies",
            "score": _score_section(doc, ["medication", "drug", "allergy", "penicillin", "dose"]),
            "feedback": "Always clarify current meds and allergies with examples."
        },
        "differential": {
            "title": "Differential Diagnosis",
            "score": _score_section(doc, ["could be", "differential", "rule out", "consider", "likely"]),
            "feedback": "State a brief differential and how you will rule in/out possibilities."
        },
        "plan": {
            "title": "Plan & Counseling",
            "score": _score_section(doc, ["test", "lab", "x-ray", "antibiotic", "ibuprofen", "return", "follow up", "hydration", "rest"]),
            "feedback": "Outline next steps and safety-netting (when to return, expected course)."
        },
        "communication": {
            "title": "Communication",
            "score": _score_section(doc + pat, ["understand", "clarify", "explain", "summarize", "teach back"]),
            "feedback": "Use plain language and teach-back to confirm understanding."
        }
    }
    raw = sum(sec["score"] for sec in sections.values())
    overall = round((raw / 30) * 100)

    return {
        "overall_score": overall,
        "sections": sections
    }

# --- ElevenLabs TTS ---
def generate_speech_elevenlabs(text: str) -> bytes:
    """Generate speech audio using ElevenLabs API"""
    if not elevenlabs_client:
        raise Exception("ElevenLabs not configured")
    
    print(f"🔊 Generating speech for: {text[:50]}...")
    
    audio_generator = elevenlabs_client.generate(
        text=text,
        voice="21m00Tcm4TlvDq8ikWAM",  # Rachel - natural female voice
        model="eleven_monolingual_v1",
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True
        )
    )
    
    audio_bytes = b"".join(audio_generator)
    print(f"✅ Generated {len(audio_bytes)} bytes of audio")
    return audio_bytes

# --- API Routes ---

@app.post("/api/auth/google-login")
def google_login():
    data = request.get_json() or {}
    idtok = data.get("id_token")
    hospital = data.get("hospital")
    if not idtok or not hospital:
        return jsonify({"message": "Missing id_token or hospital"}), 400
    try:
        if GOOGLE_CLIENT_ID:
            ginfo = id_token.verify_oauth2_token(idtok, grequests.Request(), GOOGLE_CLIENT_ID)
        else:
            ginfo = id_token.verify_oauth2_token(idtok, grequests.Request())
        email = ginfo["email"]
        name = ginfo.get("name", email.split("@")[0])
        picture = ginfo.get("picture", "")

        session = SessionLocal()
        user = session.query(User).filter_by(email=email).first()
        if not user:
            user = User(email=email, name=name, picture=picture, hospital=hospital)
            session.add(user)
            session.commit()
        else:
            user.name = name
            user.picture = picture or user.picture
            user.hospital = hospital or user.hospital
            user.last_login = dt.datetime.utcnow()
            session.commit()

        token = create_token(user)
        res = {
            "token": token,
            "user": {
                "id": user.id, "email": user.email, "name": user.name,
                "picture": user.picture, "hospital": user.hospital
            }
        }
        session.close()
        return jsonify(res)
    except Exception as e:
        return jsonify({"message": f"Google token invalid: {str(e)}"}), 401

@app.post("/api/auth/dev-login")
def dev_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    hospital = (data.get("hospital") or "").strip()
    name = (data.get("name") or (email.split("@")[0] if email else "")).strip()
    if not email or not hospital:
        return jsonify({"message": "email and hospital are required"}), 400

    s = SessionLocal()
    try:
        user = s.query(User).filter_by(email=email).first()
        if not user:
            user = User(email=email, name=name or "Doctor", picture="", hospital=hospital)
            s.add(user)
            s.commit()
        else:
            user.name = name or user.name
            user.hospital = hospital or user.hospital
            user.last_login = dt.datetime.utcnow()
            s.commit()

        token = create_token(user)
        return jsonify({
            "token": token,
            "user": {
                "id": user.id, "email": user.email, "name": user.name,
                "hospital": user.hospital, "picture": user.picture
            }
        })
    finally:
        s.close()

@app.get("/api/threads")
@login_required
def list_threads():
    s = request.dbs
    u = request.user
    q = s.query(Thread).filter_by(user_id=u.id)
    status = request.args.get("status")
    if status in ("open", "closed"):
        q = q.filter(Thread.status == status)
    threads = q.order_by(Thread.updated_at.desc()).all()
    return jsonify([{
        "id": t.id, "title": t.title, "status": t.status,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "ended_at": t.ended_at.isoformat() if t.ended_at else None
    } for t in threads])

@app.post("/api/threads")
@login_required
def create_thread():
    s = request.dbs
    u = request.user
    payload = request.get_json() or {}
    title = (payload.get("title") or "").strip()

    if not title:
        count = s.query(Thread).filter_by(user_id=u.id).count()
        title = f"Patient {count + 1}"

    t = Thread(user_id=u.id, title=title, status="open")
    s.add(t)
    s.commit()
    return jsonify({
        "id": t.id, "title": t.title, "status": t.status,
        "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat(),
        "ended_at": None
    }), 201

@app.get("/api/threads/<int:tid>")
@login_required
def get_thread(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    return jsonify({
        "id": t.id, "title": t.title, "status": t.status,
        "created_at": t.created_at.isoformat(),
        "updated_at": t.updated_at.isoformat(),
        "ended_at": t.ended_at.isoformat() if t.ended_at else None
    })

@app.get("/api/threads/<int:tid>/messages")
@login_required
def list_messages(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    return jsonify([{
        "id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()
    } for m in t.messages])

@app.post("/api/threads/<int:tid>/messages")
@login_required
def post_message(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    if t.status == "closed":
        return jsonify({"message": "Thread is closed"}), 409

    data = request.get_json() or {}
    role = data.get("role")
    content = (data.get("content") or "").strip()
    if role not in ("doctor", "patient") or not content:
        return jsonify({"message": "Invalid payload"}), 400

    dm = Message(thread_id=t.id, role=role, content=content)
    s.add(dm)

    if role == "doctor":
        conversation_history = s.query(Message).filter_by(thread_id=t.id).order_by(Message.created_at.asc()).all()
        reply = simulate_patient_reply(prompt=content, conversation_history=conversation_history)
        pm = Message(thread_id=t.id, role="patient", content=reply)
        s.add(pm)

    t.updated_at = dt.datetime.utcnow()
    s.commit()

    msgs = s.query(Message).filter_by(thread_id=t.id).order_by(Message.created_at.asc()).all()
    return jsonify([{
        "id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()
    } for m in msgs]), 201

# NEW: ElevenLabs speech endpoint
@app.get("/api/messages/<int:msg_id>/speech")
@login_required
def get_message_speech(msg_id):
    """Generate and return speech audio for a patient message"""
    s = request.dbs
    msg = s.get(Message, msg_id)
    
    if not msg:
        return jsonify({"message": "Message not found"}), 404
    
    thread = s.get(Thread, msg.thread_id)
    if not thread or thread.user_id != request.user.id:
        return jsonify({"message": "Unauthorized"}), 403
    
    if msg.role != "patient":
        return jsonify({"message": "Only patient messages have speech"}), 400
    
    try:
        audio_bytes = generate_speech_elevenlabs(msg.content)
        return send_file(
            BytesIO(audio_bytes),
            mimetype="audio/mpeg",
            as_attachment=False,
            download_name=f"patient_{msg_id}.mp3"
        )
    except Exception as e:
        print(f"❌ ElevenLabs error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"message": f"Speech generation failed: {str(e)}"}), 500

@app.patch("/api/threads/<int:tid>")
@login_required
def rename_thread(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    data = request.get_json() or {}
    new_title = (data.get("title") or "").strip()
    if not new_title:
        return jsonify({"message": "title is required"}), 400
    t.title = new_title
    t.updated_at = dt.datetime.utcnow()
    s.commit()
    return jsonify({
        "id": t.id, "title": t.title, "status": t.status,
        "created_at": t.created_at.isoformat(), "updated_at": t.updated_at.isoformat(),
        "ended_at": t.ended_at.isoformat() if t.ended_at else None
    })

@app.delete("/api/threads/<int:tid>")
@login_required
def delete_thread(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    s.delete(t)
    s.commit()
    return jsonify({"ok": True})

@app.post("/api/threads/<int:tid>/end")
@login_required
def end_thread(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404

    if t.status == "closed":
        fb = t.feedback
        if fb:
            return jsonify({
                "thread": {
                    "id": t.id, "title": t.title, "status": t.status,
                    "created_at": t.created_at.isoformat(),
                    "updated_at": t.updated_at.isoformat(),
                    "ended_at": t.ended_at.isoformat() if t.ended_at else None
                },
                "feedback": {
                    "overall_score": fb.overall_score,
                    "rubric": fb.rubric_json,
                    "created_at": fb.created_at.isoformat()
                }
            }), 200

    msgs = s.query(Message).filter_by(thread_id=t.id).order_by(Message.created_at.asc()).all()
    fb_dict = generate_feedback_for_thread(msgs)

    t.status = "closed"
    t.ended_at = dt.datetime.utcnow()
    t.updated_at = dt.datetime.utcnow()

    import json
    fb = t.feedback or Feedback(thread_id=t.id, overall_score=fb_dict["overall_score"], rubric_json=json.dumps(fb_dict), created_at=dt.datetime.utcnow())
    if t.feedback:
        fb.overall_score = fb_dict["overall_score"]
        fb.rubric_json = json.dumps(fb_dict)
        fb.created_at = dt.datetime.utcnow()
    else:
        s.add(fb)

    s.commit()

    return jsonify({
        "thread": {
            "id": t.id, "title": t.title, "status": t.status,
            "created_at": t.created_at.isoformat(),
            "updated_at": t.updated_at.isoformat(),
            "ended_at": t.ended_at.isoformat() if t.ended_at else None
        },
        "feedback": {
            "overall_score": fb.overall_score,
            "rubric": fb.rubric_json,
            "created_at": fb.created_at.isoformat()
        }
    }), 200

@app.get("/api/threads/<int:tid>/feedback")
@login_required
def get_feedback(tid):
    s = request.dbs
    t = s.get(Thread, tid)
    if not t or t.user_id != request.user.id:
        return jsonify({"message": "Not found"}), 404
    if t.status != "closed" or not t.feedback:
        return jsonify({"message": "Feedback not available"}), 404
    fb = t.feedback
    return jsonify({
        "overall_score": fb.overall_score,
        "rubric": fb.rubric_json,
        "created_at": fb.created_at.isoformat()
    })

def simulate_patient_reply(prompt: str, conversation_history: List[Message] = None) -> str:
    """Generate patient reply using Gemini AI"""
    if not GCP_PROJECT_ID:
        print("⚠ Vertex AI not configured, using fallback")
        p = prompt.lower()
        if any(k in p for k in ["pain", "ache", "hurt"]):
            return "I've had a dull ache for about 3 days. It gets worse when I move."
        if any(k in p for k in ["fever", "temperature"]):
            return "I felt feverish yesterday night, around 101°F, with chills."
        if any(k in p for k in ["cough", "breath", "chest"]):
            return "I've been coughing a lot and feel a little short of breath after climbing stairs."
        if any(k in p for k in ["medication", "allergy", "drug"]):
            return "I take only a daily multivitamin. I'm allergic to penicillin."
        return "I'm not sure, doctor. Could you explain what you mean?"
    
    try:
        context = ""
        if conversation_history:
            context = "Conversation history:\n"
            for msg in conversation_history:
                role_label = "Doctor" if msg.role == "doctor" else "Patient"
                context += f"{role_label}: {msg.content}\n"
            context += "\n"
        
        full_prompt = f"{context}{prompt}\n"
       
        contents = [Content(role="user", parts=[Part.from_text(text=full_prompt)])]
        
        response = client.models.generate_content(
            model=TUNED_MODEL,
            contents=contents,
            config=GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.3,
            ),
        )
                
        if not response or not response.text:
            return "I'm not sure how to respond to that." 
        
        return response.text.strip()
        
    except Exception as e:
        print(f"⚠ Vertex AI error: {e}")
        import traceback
        traceback.print_exc()
        return "I'm having trouble expressing myself. Could you rephrase?"

@app.get("/")
def home():
    return ("<h1>MediSim API</h1><p>Backend is running. Gemini AI + ElevenLabs integrated.</p>", 200)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)