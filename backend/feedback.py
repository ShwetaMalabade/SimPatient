import json
from google.genai.types import Content, Part, GenerateContentConfig
import os
from google import genai

# Vertex AI Configuration
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
MODEL_NAME = os.environ.get("TUNED_MODEL", "")

# Initialize Gemini client
client = genai.Client(
    vertexai=True,
    project=GCP_PROJECT_ID,
    location=GCP_LOCATION,
)

SECTION_HINTS = {
    "history": {
        "title": "History Taking",
        "hint": "Consider OPQRST (onset, provocation/palliation, quality, radiation, severity, time) to structure history."
    },
    "red_flags": {
        "title": "Red Flags",
        "hint": "Good practice to screen for red flags early (e.g., fever, chest pain, syncope)."
    },
    "meds_allergies": {
        "title": "Meds & Allergies",
        "hint": "Always clarify current meds and allergies with examples."
    },
    "differential": {
        "title": "Differential Diagnosis",
        "hint": "State a brief differential and how you will rule in/out possibilities."
    },
    "plan": {
        "title": "Plan & Counseling",
        "hint": "Outline next steps and safety-netting (when to return, expected course)."
    },
    "communication": {
        "title": "Communication",
        "hint": "Use plain language and teach-back to confirm understanding."
    },
}

def _messages_to_contents(messages):
    out = []
    print("Messages to contents:", messages)
    for m in messages:
        if m["role"] == "doctor":
            out.append(Content(role="user", parts=[Part.from_text(text=m["content"])]))
        else:
            out.append(Content(role="model", parts=[Part.from_text(text=m["content"])]))
    return out

EVAL_SYSTEM = (
    "You are a clinical skills evaluator. Evaluate only the DOCTOR's performance based on the full transcript. "
    "Be specific, reference concrete actions from the conversation, do not invent facts, and be concise."
)

# ✨ UPDATED PROMPT - Now asks for individual feedback per section
EVAL_TASK = """\
You will receive the full transcript in prior turns (doctor=role:user, patient=role:model).

Rate the DOCTOR on these six metrics using integers 0..5 (0=not attempted/very poor, 1=poor, 2=limited,
3=adequate, 4=good, 5=excellent):

- history: completeness and structure of history taking (OPQRST, pertinent positives/negatives, logical flow)
- red_flags: timely screening for red flags relevant to the case
- meds_allergies: medication history and allergies elicited with clarification
- differential: quality of differential diagnosis and brief rationale to rule-in/out
- plan: investigations and counseling/safety-netting explained appropriately
- communication: empathy, clarity, summaries, teach-back, patient-centered language

Also compute overall_score as an integer 0..100 by equally weighting the six metrics and rounding.

For EACH metric, provide:
1. A score (0-5)
2. Specific feedback (1-2 sentences) referencing what the doctor did or missed in THIS conversation

Return ONLY valid JSON with exactly these keys:

{
  "overall_feedback": "<3-6 sentence overall feedback mixing strengths and improvements>",
  "overall_score": <int 0..100>,
  "history": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about history taking in this conversation>"
  },
  "red_flags": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about red flag screening>"
  },
  "meds_allergies": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about medication/allergy inquiry>"
  },
  "differential": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about differential diagnosis>"
  },
  "plan": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about management plan>"
  },
  "communication": {
    "score": <int 0..5>,
    "feedback": "<specific feedback about communication style>"
  }
}
"""


def _fallback_sections():
    return {
        "history":       {"title": SECTION_HINTS["history"]["title"],       "score": 0, "feedback": SECTION_HINTS["history"]["hint"]},
        "red_flags":     {"title": SECTION_HINTS["red_flags"]["title"],     "score": 0, "feedback": SECTION_HINTS["red_flags"]["hint"]},
        "meds_allergies":{"title": SECTION_HINTS["meds_allergies"]["title"],"score": 0, "feedback": SECTION_HINTS["meds_allergies"]["hint"]},
        "differential":  {"title": SECTION_HINTS["differential"]["title"],  "score": 0, "feedback": SECTION_HINTS["differential"]["hint"]},
        "plan":          {"title": SECTION_HINTS["plan"]["title"],          "score": 0, "feedback": SECTION_HINTS["plan"]["hint"]},
        "communication": {"title": SECTION_HINTS["communication"]["title"], "score": 0, "feedback": SECTION_HINTS["communication"]["hint"]},
    }

def generate_feedback_json_with_model_v2(messages) -> dict:
    print("Generating feedback from generate_feedback_json_with_model_v2 method:", messages)
    contents = _messages_to_contents(messages)
    contents.append(Content(role="user", parts=[Part.from_text(text=EVAL_TASK)]))

    resp = client.models.generate_content(
        model=MODEL_NAME,
        contents=contents,
        config=GenerateContentConfig(
            system_instruction=EVAL_SYSTEM,
            temperature=0.3,  # Slightly higher for more varied feedback
            response_mime_type="application/json",
        ),
    )

    raw = (resp.text or "").strip()
    data = None
    try:
        data = json.loads(raw)
        
        # Validate structure
        required_keys = ["overall_feedback", "overall_score", "history", "plan", 
                        "red_flags", "meds_allergies", "differential", "communication"]
        for k in required_keys:
            if k not in data:
                raise ValueError(f"missing key: {k}")
        
        # Clamp overall score
        data["overall_score"] = int(max(0, min(100, int(data["overall_score"]))))
        
        # Validate each section has score and feedback
        for k in ["history", "plan", "red_flags", "meds_allergies", "differential", "communication"]:
            if not isinstance(data[k], dict) or "score" not in data[k] or "feedback" not in data[k]:
                raise ValueError(f"Invalid structure for {k}")
            data[k]["score"] = int(max(0, min(5, int(data[k]["score"]))))
            
    except Exception as e:
        print(f"Error in generating feedback: {e}")
        print(f"Raw response: {raw}")
        return {
            "feedback_text": "Automatic fallback feedback. (LLM JSON unavailable.)",
            "overall_score": 0,
            "sections": _fallback_sections(),
        }

    # ✨ BUILD SECTIONS USING AI FEEDBACK (not generic hints!)
    sections = {
        "history": {
            "title": SECTION_HINTS["history"]["title"],
            "score": data["history"]["score"],
            "feedback": data["history"]["feedback"]  # ✅ Using AI feedback!
        },
        "red_flags": {
            "title": SECTION_HINTS["red_flags"]["title"],
            "score": data["red_flags"]["score"],
            "feedback": data["red_flags"]["feedback"]  # ✅ Using AI feedback!
        },
        "meds_allergies": {
            "title": SECTION_HINTS["meds_allergies"]["title"],
            "score": data["meds_allergies"]["score"],
            "feedback": data["meds_allergies"]["feedback"]  # ✅ Using AI feedback!
        },
        "differential": {
            "title": SECTION_HINTS["differential"]["title"],
            "score": data["differential"]["score"],
            "feedback": data["differential"]["feedback"]  # ✅ Using AI feedback!
        },
        "plan": {
            "title": SECTION_HINTS["plan"]["title"],
            "score": data["plan"]["score"],
            "feedback": data["plan"]["feedback"]  # ✅ Using AI feedback!
        },
        "communication": {
            "title": SECTION_HINTS["communication"]["title"],
            "score": data["communication"]["score"],
            "feedback": data["communication"]["feedback"]  # ✅ Using AI feedback!
        },
    }

    result = {
        "feedback_text": data["overall_feedback"],  # Changed from "feedback" to "overall_feedback"
        "overall_score": data["overall_score"],
        "sections": sections,
    }
    print("Generated feedback from generate_feedback_json_with_model_v2 method:", result)
    return result