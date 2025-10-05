import os
import datetime as dt
from functools import wraps
from typing import Optional, List
from io import BytesIO
import json
import jwt

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from google.cloud import firestore
from google.oauth2 import id_token
from google.auth.transport import requests as grequests
from google import genai
from google.genai.types import Content, Part, GenerateContentConfig

from feedback import generate_feedback_json_with_model_v2

try:
    from elevenlabs.client import ElevenLabs
    from elevenlabs import VoiceSettings
    ELEVENLABS_AVAILABLE = True
except ImportError:
    print("⚠️ elevenlabs not installed. Run: pip install elevenlabs==1.7.0")
    ELEVENLABS_AVAILABLE = False


# --- CONFIGURATION ---
SYSTEM_INSTRUCTION = (
    "You are role-playing a patient in a clinical interview. "
    "Stay consistent with earlier answers. Do not provide diagnoses or medical advice. "
    "Only speak as the patient."
)

SECRET = os.environ.get("SECRET_KEY", "dev-secret-change-me")
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
TUNED_MODEL = os.environ.get("TUNED_MODEL", "")
ELEVENLABS_API_KEY = os.environ.get("ELEVENLABS_API_KEY")

# --- INITIALIZATION ---
db = firestore.Client(project=GCP_PROJECT_ID)

genai_client = genai.Client(vertexai=True, project=GCP_PROJECT_ID, location=GCP_LOCATION)

elevenlabs_client = None
if ELEVENLABS_AVAILABLE and ELEVENLABS_API_KEY:
    try:
        elevenlabs_client = ElevenLabs(api_key=ELEVENLABS_API_KEY)
        print("✅ ElevenLabs initialized successfully")
    except Exception as e:
        print(f"❌ ElevenLabs initialization failed: {e}")
else:
    print("⚠️ ElevenLabs unavailable or missing API key")

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": [FRONTEND_ORIGIN]}}, supports_credentials=False)


# --- AUTH HELPERS ---
def create_token(uid: str, email: str) -> str:
    payload = {
        "sub": uid,
        "email": email,
        "exp": dt.datetime.utcnow() + dt.timedelta(days=7)
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def current_user() -> Optional[str]:
    auth = request.headers.get("Authorization", "")
    parts = auth.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
        try:
            data = jwt.decode(token, SECRET, algorithms=["HS256"])
            return data["sub"]
        except Exception:
            return None
    return None


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        uid = current_user()
        if not uid:
            return jsonify({"message": "Unauthorized"}), 401
        request.user_id = uid
        return fn(*args, **kwargs)
    return wrapper


# --- ELEVENLABS TTS ---
def generate_speech_elevenlabs(text: str) -> bytes:
    if not elevenlabs_client:
        raise Exception("ElevenLabs not configured properly")
    audio_generator = elevenlabs_client.generate(
        text=text,
        voice="21m00Tcm4TlvDq8ikWAM",
        model="eleven_monolingual_v1",
        voice_settings=VoiceSettings(
            stability=0.5,
            similarity_boost=0.75,
            style=0.0,
            use_speaker_boost=True
        )
    )
    return b"".join(audio_generator)


# --- GEMINI SIMULATION ---
def simulate_patient_reply(prompt: str, conversation_history: List[dict] = None) -> str:
    if not GCP_PROJECT_ID:
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
            for msg in conversation_history:
                role = msg["role"].capitalize()
                context += f"{role}: {msg['content']}\n"
        full_prompt = f"{context}\nDoctor: {prompt}\n"
        contents = [Content(role="user", parts=[Part.from_text(text=full_prompt)])]
        response = genai_client.models.generate_content(
            model=TUNED_MODEL,
            contents=contents,
            config=GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.3,
            ),
        )
        return response.text.strip() if response and response.text else "I'm not sure how to respond to that."
    except Exception as e:
        print(f"⚠️ Gemini error: {e}")
        return "I'm having trouble expressing myself right now."


# --- FEEDBACK ---
def generate_feedback_for_thread(user_id: str, thread_id: str) -> dict:
    msgs_ref = (
        db.collection("users")
          .document(user_id)
          .collection("threads")
          .document(thread_id)
          .collection("messages")
    )
    messages = [
        {"role": m.get("role"), "content": m.get("content")}
        for m in (msg.to_dict() for msg in msgs_ref.order_by("created_at").stream())
    ]
    return generate_feedback_json_with_model_v2(messages)


def _iso(dtobj):
    # Firestore returns datetime objects; make them JSON-safe
    if isinstance(dtobj, dt.datetime):
        return dtobj.isoformat()
    return dtobj or None


# --- API ROUTES ---


@app.get("/api/threads/<thread_id>")
@login_required
def get_thread(thread_id):
    thread_ref = (
        db.collection("users")
          .document(request.user_id)
          .collection("threads")
          .document(thread_id)
    )
    doc = thread_ref.get()
    if not doc.exists:
        return jsonify({"message": "Not found"}), 404

    data = doc.to_dict() or {}
    return jsonify({
        "id": thread_id,
        "title": data.get("title", "New Patient Session"),
        "status": data.get("status", "open"),
        "created_at": _iso(data.get("created_at")),
        "updated_at": _iso(data.get("updated_at")),
        "ended_at": _iso(data.get("ended_at")),
    })

@app.post("/api/auth/google-login")
def google_login():
    data = request.get_json() or {}
    idtok = data.get("id_token")
    hospital = data.get("hospital")
    if not idtok or not hospital:
        return jsonify({"message": "Missing id_token or hospital"}), 400
    try:
        ginfo = id_token.verify_oauth2_token(idtok, grequests.Request(), GOOGLE_CLIENT_ID)
        email = ginfo["email"]
        name = ginfo.get("name", email.split("@")[0])
        picture = ginfo.get("picture", "")

        users_ref = db.collection("users")
        query = users_ref.where("email", "==", email).limit(1).stream()
        user_doc = next(query, None)
        if user_doc:
            uid = user_doc.id
            users_ref.document(uid).update({
                "name": name,
                "picture": picture,
                "hospital": hospital,
                "last_login": dt.datetime.utcnow(),
            })
        else:
            new_doc = users_ref.document()
            uid = new_doc.id
            new_doc.set({
                "email": email,
                "name": name,
                "picture": picture,
                "hospital": hospital,
                "created_at": dt.datetime.utcnow(),
                "last_login": dt.datetime.utcnow(),
            })

        token = create_token(uid, email)
        return jsonify({
            "token": token,
            "user": {"id": uid, "email": email, "name": name, "picture": picture, "hospital": hospital}
        })
    except Exception as e:
        return jsonify({"message": f"Google token invalid: {str(e)}"}), 401


@app.post("/api/auth/dev-login")
def dev_login():
    data = request.get_json() or {}
    email = data.get("email")
    hospital = data.get("hospital")
    if not email or not hospital:
        return jsonify({"message": "email and hospital required"}), 400
    users_ref = db.collection("users")
    query = users_ref.where("email", "==", email).limit(1).stream()
    user_doc = next(query, None)
    if user_doc:
        uid = user_doc.id
    else:
        new_doc = users_ref.document()
        uid = new_doc.id
        new_doc.set({
            "email": email,
            "name": email.split("@")[0],
            "hospital": hospital,
            "created_at": dt.datetime.utcnow(),
            "last_login": dt.datetime.utcnow(),
        })
    token = create_token(uid, email)
    return jsonify({
        "token": token,
        "user": {"id": uid, "email": email, "name": email.split('@')[0], "hospital": hospital}
    })


@app.get("/api/threads")
@login_required
def list_threads():
    threads_ref = db.collection("users").document(request.user_id).collection("threads").order_by("created_at", direction="DESCENDING")
    status = request.args.get("status")
    q = threads_ref
    if status:
        q = q.where("status", "==", status)
    threads = [{"id": t.id, **t.to_dict()} for t in q.stream()]
    return jsonify(threads)


@app.post("/api/threads")
@login_required
def create_thread():
    threads_ref = db.collection("users").document(request.user_id).collection("threads")
    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        count = len(list(threads_ref.stream()))
        title = f"Patient {count + 1}"
    thread_doc = threads_ref.document()
    thread_doc.set({
        "title": title,
        "status": "open",
        "created_at": dt.datetime.utcnow(),
        "updated_at": dt.datetime.utcnow(),
    })
    return jsonify({"id": thread_doc.id, "title": title, "status": "open"}), 201

@app.get("/api/threads/<thread_id>/messages")
@login_required
def list_messages(thread_id):
    thread_ref = (
        db.collection("users")
          .document(request.user_id)
          .collection("threads")
          .document(thread_id)
    )
    if not thread_ref.get().exists:
        return jsonify({"message": "Not found"}), 404

    msgs_ref = thread_ref.collection("messages").order_by("created_at")
    messages = []
    for snap in msgs_ref.stream():
        d = snap.to_dict() or {}
        messages.append({
            "id": snap.id,
            "role": d.get("role"),
            "content": d.get("content"),
            "created_at": _iso(d.get("created_at")),
        })

    return jsonify(messages)

@app.post("/api/threads/<thread_id>/messages")
@login_required
def post_message(thread_id):
    threads_ref = db.collection("users").document(request.user_id).collection("threads").document(thread_id)
    if not threads_ref.get().exists:
        return jsonify({"message": "Thread not found"}), 404

    data = request.get_json() or {}
    role = data.get("role")
    content = (data.get("content") or "").strip()
    if role not in ("doctor", "patient") or not content:
        return jsonify({"message": "Invalid payload"}), 400

    msg_ref = threads_ref.collection("messages").document()
    msg_ref.set({
        "role": role,
        "content": content,
        "created_at": dt.datetime.utcnow(),
    })

    if role == "doctor":
        messages = [{"role": m.get("role"), "content": m.get("content")} for m in (x.to_dict() for x in threads_ref.collection("messages").order_by("created_at").stream())]
        reply = simulate_patient_reply(content, messages)
        threads_ref.collection("messages").document().set({
            "role": "patient",
            "content": reply,
            "created_at": dt.datetime.utcnow(),
        })

    threads_ref.update({"updated_at": dt.datetime.utcnow()})
    messages = [{"id": m.id, **m.to_dict()} for m in threads_ref.collection("messages").order_by("created_at").stream()]
    return jsonify(messages), 201


# @app.post("/api/threads/<thread_id>/end")
# @login_required
# def end_thread(thread_id):
#     thread_ref = db.collection("users").document(request.user_id).collection("threads").document(thread_id)
#     thread = thread_ref.get()
#     if not thread.exists:
#         return jsonify({"message": "Not found"}), 404

#     fb_ref = thread_ref.collection("feedback").document("latest")
#     fb_dict = generate_feedback_for_thread(request.user_id, thread_id)
#     thread_ref.update({
#         "status": "closed",
#         "ended_at": dt.datetime.utcnow(),
#         "updated_at": dt.datetime.utcnow()
#     })
#     fb_ref.set({
#         "feedback_text": fb_dict["feedback_text"],
#         "overall_score": fb_dict["overall_score"],
#         "rubric_json": fb_dict["sections"],
#         "created_at": dt.datetime.utcnow(),
#     })
#     return jsonify({
#         "thread": {"id": thread_id, "status": "closed"},
#         "feedback": fb_dict
#     }), 200

@app.post("/api/threads/<thread_id>/end")
@login_required
def end_thread(thread_id):
    thread_ref = db.collection("users").document(request.user_id).collection("threads").document(thread_id)
    thread = thread_ref.get()
    if not thread.exists:
        return jsonify({"message": "Not found"}), 404

    # ✅ CHECK MESSAGE COUNT - Don't evaluate empty sessions
    msgs_ref = thread_ref.collection("messages")
    messages = list(msgs_ref.stream())
    
    # Count doctor messages (actual conversation)
    doctor_messages = [m for m in messages if m.to_dict().get("role") == "doctor"]
    
    if len(doctor_messages) < 2:
        # Too few messages - delete the thread entirely
        print(f"⚠️ Deleting empty thread {thread_id} - only {len(doctor_messages)} doctor messages")
        
        # Delete all messages first
        for msg in messages:
            msg.reference.delete()
        
        # Delete the thread
        thread_ref.delete()
        
        return jsonify({
            "message": "Thread deleted - insufficient conversation for evaluation",
            "deleted": True
        }), 200
    
    # Proceed with normal feedback generation
    try:
        fb_dict = generate_feedback_for_thread(request.user_id, thread_id)
        
        thread_ref.update({
            "status": "closed",
            "ended_at": dt.datetime.utcnow(),
            "updated_at": dt.datetime.utcnow()
        })
        
        fb_ref = thread_ref.collection("feedback").document("latest")
        fb_ref.set({
            "feedback_text": fb_dict["feedback_text"],
            "overall_score": fb_dict["overall_score"],
            "rubric_json": fb_dict["sections"],
            "created_at": dt.datetime.utcnow(),
        })
        
        return jsonify({
            "thread": {"id": thread_id, "status": "closed"},
            "feedback": fb_dict
        }), 200
        
    except Exception as e:
        print(f"❌ Feedback generation failed: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"message": f"Failed to generate feedback: {str(e)}"}), 500

@app.get("/api/threads/<thread_id>/feedback")
@login_required
def get_feedback(thread_id):
    fb_ref = (
        db.collection("users")
          .document(request.user_id)
          .collection("threads")
          .document(thread_id)
          .collection("feedback")
          .document("latest")
    )
    fb = fb_ref.get()
    if not fb.exists:
        return jsonify({"message": "Feedback not available"}), 404
    return jsonify(fb.to_dict())


@app.get("/api/messages/<msg_id>/speech")
@login_required
def get_message_speech(msg_id):
    """
    Look up the message under the current user's threads in Firestore,
    ensure it's a patient message, then return ElevenLabs TTS audio.
    """
    try:
        user_ref = db.collection("users").document(request.user_id)
        threads_ref = user_ref.collection("threads")

        found_data = None

        # Search each thread's messages for this message ID
        for thread_snap in threads_ref.stream():
            msg_snap = (
                threads_ref
                .document(thread_snap.id)
                .collection("messages")
                .document(msg_id)
                .get()
            )
            if msg_snap.exists:
                found_data = msg_snap.to_dict() or {}
                break

        if not found_data:
            return jsonify({"message": "Message not found"}), 404

        # Only patient messages are allowed for TTS
        if found_data.get("role") != "patient":
            return jsonify({"message": "Only patient messages have speech"}), 400

        text = (found_data.get("content") or "").strip()
        if not text:
            return jsonify({"message": "Message has no content"}), 400

        # If you implemented expressions, this will use them; otherwise we fall back.
        try:
            expression = found_data.get("expression")  # may be None for older messages
            audio_bytes = generate_speech_elevenlabs_expressive(text, expression)
        except NameError:
            # expressive helper not defined → use the basic TTS
            audio_bytes = generate_speech_elevenlabs(text)

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
    
# Add this to app.py after the other routes

# Replace the @app.get("/api/analytics") endpoint in app.py with this:

@app.get("/api/analytics")
@login_required
def get_analytics():
    """Get comprehensive analytics for the logged-in doctor"""
    try:
        # Fetch all closed threads (no order_by to avoid index requirement)
        threads_ref = (
            db.collection("users")
            .document(request.user_id)
            .collection("threads")
            .where("status", "==", "closed")
        )
        
        sessions_data = []
        category_totals = {
            "history": [], "red_flags": [], "meds_allergies": [],
            "differential": [], "plan": [], "communication": []
        }
        overall_scores = []
        
        # Collect all threads
        all_threads = []
        for thread_snap in threads_ref.stream():
            thread_data = thread_snap.to_dict()
            thread_id = thread_snap.id
            
            # Get feedback for this thread
            fb_ref = (
                db.collection("users").document(request.user_id)
                .collection("threads").document(thread_id)
                .collection("feedback").document("latest")
            )
            fb_snap = fb_ref.get()
            
            if fb_snap.exists:
                fb_data = fb_snap.to_dict()
                rubric = fb_data.get("rubric_json", {})
                if isinstance(rubric, str):
                    rubric = json.loads(rubric)
                
                sections = rubric.get("sections", rubric)
                overall_score = fb_data.get("overall_score", 0)
                
                all_threads.append({
                    "id": thread_id,
                    "title": thread_data.get("title", "Untitled"),
                    "ended_at": thread_data.get("ended_at"),
                    "ended_at_iso": _iso(thread_data.get("ended_at")),
                    "overall_score": overall_score,
                    "sections": sections
                })
        
        # Sort by ended_at in Python (most recent first)
        all_threads.sort(key=lambda x: x.get("ended_at") or dt.datetime.min, reverse=True)
        
        # Process sorted threads
        for thread in all_threads:
            overall_scores.append(thread["overall_score"])
            
            for category in category_totals.keys():
                if category in thread["sections"]:
                    score = thread["sections"][category].get("score", 0)
                    category_totals[category].append(score)
            
            sessions_data.append({
                "id": thread["id"],
                "title": thread["title"],
                "ended_at": thread["ended_at_iso"],
                "overall_score": thread["overall_score"],
                "categories": {
                    cat: thread["sections"].get(cat, {}).get("score", 0) 
                    for cat in category_totals.keys()
                }
            })
        
        total_sessions = len(overall_scores)
        
        if total_sessions == 0:
            return jsonify({
                "total_sessions": 0,
                "overall_avg": 0,
                "category_avg": {},
                "trend_data": [],
                "recent_sessions": [],
                "insights": {"strongest": None, "weakest": None, "improvement_areas": []}
            })
        
        overall_avg = sum(overall_scores) / total_sessions
        
        # Calculate category averages (convert 0-5 scale to 0-100)
        category_avg = {
            cat: (sum(scores) / len(scores) * 20) if scores else 0
            for cat, scores in category_totals.items()
        }
        
        # Find strongest and weakest areas
        strongest = max(category_avg.items(), key=lambda x: x[1])
        weakest = min(category_avg.items(), key=lambda x: x[1])
        
        # Improvement areas (categories below 60%)
        improvement_areas = [
            {"category": cat, "score": score}
            for cat, score in category_avg.items() if score < 60
        ]
        
        # Trend data (last 10 sessions, oldest to newest)
        trend_data = [
            {
                "session": f"S{i+1}",
                "score": sessions_data[i]["overall_score"],
                "date": sessions_data[i]["ended_at"]
            }
            for i in range(min(10, len(sessions_data)))
        ]
        trend_data.reverse()  # Reverse to show oldest to newest
        
        return jsonify({
            "total_sessions": total_sessions,
            "overall_avg": round(overall_avg, 1),
            "category_avg": {k: round(v, 1) for k, v in category_avg.items()},
            "trend_data": trend_data,
            "recent_sessions": sessions_data[:5],  # Last 5 sessions
            "insights": {
                "strongest": {"category": strongest[0], "score": round(strongest[1], 1)},
                "weakest": {"category": weakest[0], "score": round(weakest[1], 1)},
                "improvement_areas": improvement_areas
            }
        })
        
    except Exception as e:
        print(f"❌ Analytics error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"message": f"Analytics failed: {str(e)}"}), 500


@app.get("/")
def home():
    status = []
    if elevenlabs_client:
        status.append("ElevenLabs ✅")
    else:
        status.append("ElevenLabs ❌")
    if GCP_PROJECT_ID:
        status.append("Gemini AI ✅")
    else:
        status.append("Gemini AI ❌")
    return f"<h1>MediSim API</h1><p>Status: {' | '.join(status)}</p>"


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)