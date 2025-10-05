import json
from google.genai.types import Content, Part, GenerateContentConfig
import os
from google import genai
# Vertex AI Configuration
GCP_PROJECT_ID = os.environ.get("GCP_PROJECT_ID", "")
GCP_LOCATION = os.environ.get("GCP_LOCATION", "us-central1")
MODEL_NAME = os.environ.get("TUNED_MODEL", "")  # same endpoint string you used in the working sanity check

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
    for m in messages:
        if m.role == "doctor":
            out.append(Content(role="user", parts=[Part.from_text(text=m.content)]))
        else:
            out.append(Content(role="model", parts=[Part.from_text(text=m.content)]))
    return out

EVAL_SYSTEM = (
    "You are a clinical skills evaluator. Evaluate only the DOCTOR's performance based on the full transcript. "
    "Be specific, reference concrete actions, do not invent facts, and be concise."
)

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

Return ONLY valid JSON with exactly these keys:

{
  "feedback": "<3-6 sentence feedback text mixing strengths and improvements>",
  "overall_score": <int 0..100>,
  "history": <int 0..5>,
  "plan": <int 0..5>,
  "red_flags": <int 0..5>,
  "meds_allergies": <int 0..5>,
  "differential": <int 0..5>,
  "communication": <int 0..5>
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
            temperature=0.2,
            response_mime_type="application/json",
        ),
    )

    raw = (resp.text or "").strip()
    data = None
    try:
        data = json.loads(raw)
        for k in ["feedback","overall_score","history","plan","red_flags","meds_allergies","differential","communication"]:
            if k not in data:
                raise ValueError(f"missing key: {k}")
        # clamp ranges
        data["overall_score"] = int(max(0, min(100, int(data["overall_score"]))))
        for k in ["history","plan","red_flags","meds_allergies","differential","communication"]:
            data[k] = int(max(0, min(5, int(data[k]))))
    except Exception:
        print("Error in generating feedback within generate_feedback_json_with_model_v2 method")
        return {
            "feedback": "Automatic fallback feedback. (LLM JSON unavailable.)",
            "overall_score": 0,
            "sections": _fallback_sections(),
        }

    sections = {
        "history":       {"title": SECTION_HINTS["history"]["title"],       "score": data["history"],       "feedback": SECTION_HINTS["history"]["hint"]},
        "red_flags":     {"title": SECTION_HINTS["red_flags"]["title"],     "score": data["red_flags"],     "feedback": SECTION_HINTS["red_flags"]["hint"]},
        "meds_allergies":{"title": SECTION_HINTS["meds_allergies"]["title"],"score": data["meds_allergies"],"feedback": SECTION_HINTS["meds_allergies"]["hint"]},
        "differential":  {"title": SECTION_HINTS["differential"]["title"],  "score": data["differential"],  "feedback": SECTION_HINTS["differential"]["hint"]},
        "plan":          {"title": SECTION_HINTS["plan"]["title"],          "score": data["plan"],          "feedback": SECTION_HINTS["plan"]["hint"]},
        "communication": {"title": SECTION_HINTS["communication"]["title"], "score": data["communication"], "feedback": SECTION_HINTS["communication"]["hint"]},
    }

    result = {
        "feedback_text": data["feedback"],
        "overall_score": data["overall_score"],
        "sections": sections,
    }
    print("Generated feedback from generate_feedback_json_with_model_v2 method:", result)
    return result