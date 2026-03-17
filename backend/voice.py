"""
voice.py — Voice Assistant Blueprint
--------------------------------------
Handles:
  POST /api/voice-assistant  → receives {message, language}, calls Groq LLM,
                               converts response to speech via gTTS,
                               returns {text, audioUrl}
  GET  /api/audio/<filename> → serves the generated audio file

Dependencies:
    pip install groq gtts flask
"""

import os
import uuid
import re

from flask import Blueprint, request, jsonify, send_from_directory
from groq import Groq

# ── Optional: gTTS for text-to-speech ────────────────────────────────────────
try:
    from gtts import gTTS
    TTS_AVAILABLE = True
except ImportError:
    TTS_AVAILABLE = False

# ── Blueprint setup ───────────────────────────────────────────────────────────
voice_bp = Blueprint("voice", __name__)

AUDIO_DIR = os.path.join(os.path.dirname(__file__), "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

# ── Groq client (lazy-init so app context isn't needed at import time) ─────────
def _groq_client() -> Groq:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set in environment variables.")
    return Groq(api_key=api_key)


# ── Language code map for gTTS ─────────────────────────────────────────────────
LANG_MAP = {
    "en":    "en",
    "hi":    "hi",
    "ta":    "ta",
    "te":    "te",
    "hindi": "hi",
    "tamil": "ta",
    "telugu": "te",
}

# ── System prompt ──────────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are Saheli, a compassionate Digital Safety Companion designed to protect
women and elderly users from online scams, fraud, and cyber threats.

When a user shares a concern, ALWAYS respond using exactly this structure:

**What To Do:** [Concrete, actionable first steps the user should take right now]

**What Not To Do:** [Specific dangerous actions the user must avoid — e.g. never share OTP, password, CVV]

**Safer Alternative:** [A trusted, official channel or safe method to resolve the issue]

Keep your tone warm, calm, and empowering. Use simple, jargon-free language.
Respond in the same language the user writes in when possible.
Limit your response to 120 words maximum. Do not add extra sections."""


def _clean_text_for_tts(text: str) -> str:
    """Strip markdown bold markers for cleaner TTS output."""
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"\*(.*?)\*", r"\1", text)
    return text.strip()


# ── Routes ─────────────────────────────────────────────────────────────────────

@voice_bp.route("/api/voice-assistant", methods=["POST"])
def voice_assistant():
    """
    Receive user message → call Groq LLM → convert response to speech → return JSON.

    Request JSON:
        { "message": "...", "language": "en" }

    Response JSON:
        { "text": "...", "audioUrl": "/api/audio/<filename>.mp3" }
    """
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Invalid or missing JSON body."}), 400

    user_message = (data.get("message") or "").strip()
    language     = (data.get("language") or "en").lower()

    if not user_message:
        return jsonify({"error": "Field 'message' is required and cannot be empty."}), 422

    # ── 1. Groq LLM ───────────────────────────────────────────────────────────
    try:
        client = _groq_client()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",   # or "llama-3.1-8b-instant" for faster/cheaper
            messages=[
                {"role": "system",  "content": SYSTEM_PROMPT},
                {"role": "user",    "content": user_message},
            ],
            max_tokens=5000,
            temperature=0.5,
        )
        ai_text = completion.choices[0].message.content.strip()
    except EnvironmentError as exc:
        return jsonify({"error": str(exc)}), 500
    except Exception as exc:
        return jsonify({"error": f"LLM error: {str(exc)}"}), 502

    # ── 2. Text-to-Speech ─────────────────────────────────────────────────────
    audio_url = None
    if TTS_AVAILABLE:
        try:
            tts_lang  = LANG_MAP.get(language, "en")
            tts_text  = _clean_text_for_tts(ai_text)
            filename  = f"response_{uuid.uuid4().hex}.mp3"
            filepath  = os.path.join(AUDIO_DIR, filename)

            tts = gTTS(text=tts_text, lang=tts_lang, slow=False)
            tts.save(filepath)
            audio_url = f"/api/audio/{filename}"
        except Exception as exc:
            # TTS failure is non-fatal — still return text response
            audio_url = None

    return jsonify({"text": ai_text, "audioUrl": audio_url}), 200


@voice_bp.route("/api/audio/<path:filename>", methods=["GET"])
def serve_audio(filename: str):
    """Serve a generated audio file from the /audio directory."""
    return send_from_directory(AUDIO_DIR, filename, mimetype="audio/mpeg")