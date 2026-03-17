"""
sim.py — Simulation Generation Blueprint
-----------------------------------------
LLM  : Groq  (llama-3.3-70b-versatile)
Fallback : bundled dataset  →  sim.json  (same folder as this file)

Dependencies:
    pip install groq python-dotenv flask flask-cors
"""

import os
import json
import time
import uuid
import random
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from flask import Blueprint, request, jsonify
from groq import Groq, APIConnectionError, RateLimitError, APIStatusError
from dotenv import load_dotenv

load_dotenv()

# ── Blueprint ──────────────────────────────────────────────────────────────────
sim_bp = Blueprint("simulation", __name__, url_prefix="/api/sim")
logger = logging.getLogger(__name__)

# ── Groq Client (lazy) ────────────────────────────────────────────────────────
_groq_client: Optional[Groq] = None

def _get_client() -> Groq:
    global _groq_client
    if _groq_client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY is not set in environment variables.")
        _groq_client = Groq(api_key=api_key)
    return _groq_client

# ── Dataset (fallback, lazy-loaded) ──────────────────────────────────────────
_dataset: list[dict] = []

def _load_dataset() -> list[dict]:
    """Load sim.json from the same directory as this file (lazy + cached)."""
    global _dataset
    if _dataset:
        return _dataset
    candidates = [
        Path(__file__).parent / "sim.json",
        Path("sim.json"),
    ]
    for path in candidates:
        if path.exists():
            try:
                with open(path, encoding="utf-8") as f:
                    _dataset = json.load(f)
                logger.info("Loaded %d fallback simulations from %s", len(_dataset), path)
                return _dataset
            except Exception as exc:
                logger.warning("Could not load dataset from %s: %s", path, exc)
    logger.warning("sim.json not found — Groq-only mode active.")
    return []

# ── In-Memory Stores ──────────────────────────────────────────────────────────
_simulation_store: list[dict] = []
_analytics_store:  list[dict] = []
_template_store:   list[dict] = []

# ── System Prompt ─────────────────────────────────────────────────────────────
# IMPORTANT: This prompt is carefully engineered to force the correct UI type
# per scenario AND ensure options[] is NEVER empty for list-type UIs.
SYSTEM_PROMPT = """You are an expert digital literacy simulation engine for Indian users.
Respond ONLY with a valid JSON object — no markdown, no explanation, no code fences.

OUTPUT FORMAT (strict):
{
  "title": "short simulation title",
  "app": "exact app/service name",
  "appIcon": "single relevant emoji",
  "appColor": "#hexcolor matching the real brand",
  "appColorSecondary": "#slightly lighter hex",
  "steps": [ ...4-6 steps... ],
  "fraudWarning": "safety warning string or null",
  "completionMessage": "short celebratory message",
  "coinsReward": 15
}

Each step:
{
  "id": 1,
  "title": "Step title",
  "instruction": "Clear, beginner-friendly instruction in simple English",
  "tip": "Safety tip or null",
  "uiElement": {
    "type": "CHOOSE FROM LIST BELOW",
    "label": "descriptive label",
    "placeholder": "input placeholder or empty string",
    "options": ["always", "provide", "real", "options", "here"],
    "value": "pre-filled value or empty string",
    "buttonText": "button label",
    "subtext": "supporting text"
  }
}

UI TYPE SELECTION RULES — follow exactly:
- home_screen       : First step for any app. ALWAYS include 4 options[] matching that app's real menu items.
- search_bar        : Searching for a contact, station, product. Include 4-6 realistic options[].
- contact_list      : Selecting a person to send money to. Include 4 realistic Indian name options[].
- amount_input      : Entering a rupee amount to pay or send.
- pin_input         : Entering UPI PIN or ATM PIN (4-6 digits).
- otp_input         : Entering a 6-digit OTP received via SMS.
- confirmation      : Review screen before final payment. Include options[] like ["Amount: ₹X","To: Name","Via: UPI"].
- qr_scanner        : Scanning a QR code to pay.
- form_fields       : Filling a registration/login/address form. Include field names in options[].
- menu_list         : Choosing from a list of services/categories. Include 4-6 options[].
- success_screen    : Final success/confirmation screen.
- atm_screen        : ATM machine interface. Include 4 options[]: Withdraw Cash, Balance Enquiry, Mini Statement, Change PIN.
- ticket_booking    : IRCTC train ticket booking. Include options[]: ["From Station", "To Station"].
- recharge_screen   : Mobile/DTH recharge screen.
- bank_dashboard    : Net banking home screen. Include 4 options[].

SCENARIO → UI TYPE MAPPING (use these exact sequences):

GPay / PhonePe / Paytm SEND MONEY:
  home_screen → contact_list → amount_input → confirmation → pin_input → success_screen

IRCTC TRAIN TICKET:
  home_screen → ticket_booking → search_bar → form_fields → confirmation → success_screen

ATM WITHDRAW:
  atm_screen → pin_input → menu_list → amount_input → success_screen

MOBILE RECHARGE:
  home_screen → recharge_screen → confirmation → pin_input → success_screen

ELECTRICITY BILL:
  home_screen → form_fields → confirmation → pin_input → success_screen

BANK BALANCE CHECK:
  bank_dashboard → menu_list → success_screen

QR CODE PAYMENT:
  home_screen → qr_scanner → amount_input → pin_input → success_screen

CRITICAL RULES:
1. options[] must NEVER be empty [] for these types: home_screen, contact_list, search_bar, menu_list, atm_screen, bank_dashboard, ticket_booking, confirmation.
2. For home_screen, options[] must contain the real app's main menu items (e.g. GPay: ["New Payment","Pay Contacts","Scan QR","History"]).
3. For contact_list, options[] must contain 4-5 realistic Indian names.
4. For atm_screen, options[] must always be: ["Withdraw Cash","Balance Enquiry","Mini Statement","Change PIN"].
5. appColor must match the real brand color (GPay:#4285F4, PhonePe:#5F259F, Paytm:#002970, IRCTC:#003580, ATM Machine:#1a472a).
6. coinsReward must be an integer between 10-25.
7. fraudWarning is REQUIRED (not null) for: UPI, OTP, QR, ATM, banking tasks.
8. Output ONLY the JSON. Nothing else."""

# ── Fraud warning enrichment ──────────────────────────────────────────────────
FRAUD_PATTERNS: dict[str, str] = {
    "upi":         "Never share your UPI PIN with anyone — not even bank employees.",
    "gpay":        "Google Pay will never ask for your PIN over a call or SMS.",
    "google pay":  "Google Pay will never ask for your PIN over a call or SMS.",
    "phonepe":     "PhonePe will never ask for your OTP via phone. Hang up on suspicious callers.",
    "paytm":       "Paytm will never request your wallet password through a third-party link.",
    "otp":         "Never share OTPs with anyone — banks and apps will never ask for them.",
    "qr":          "Do not scan QR codes sent by strangers; scanning can deduct money instantly.",
    "atm":         "Always cover the keypad while entering your PIN. Check the card slot for skimmers.",
    "bank":        "Legitimate bank officials never ask for your full card number or account password.",
    "irctc":       "Buy train tickets only on the official IRCTC app or website. Avoid touts.",
    "recharge":    "Recharge only through official carrier apps or well-known portals.",
    "electricity": "Pay electricity bills only via official state board websites or government apps.",
}

VALID_UI_TYPES = {
    "home_screen", "search_bar", "contact_list", "amount_input",
    "pin_input", "confirmation", "qr_scanner", "form_fields",
    "menu_list", "success_screen", "atm_screen", "ticket_booking",
    "recharge_screen", "otp_input", "bank_dashboard",
}

# ── Validation ────────────────────────────────────────────────────────────────

def _validate_ui_element(el: dict, idx: int) -> list[str]:
    errors: list[str] = []
    if "type" not in el:
        errors.append(f"Step {idx}: uiElement missing 'type'")
    elif el["type"] not in VALID_UI_TYPES:
        errors.append(f"Step {idx}: unknown uiElement type '{el['type']}'")
    if not el.get("label"):
        errors.append(f"Step {idx}: uiElement missing 'label'")
    # Warn if list-type UIs have empty options (we patch these in _enrich)
    return errors


def _validate_simulation(sim: dict) -> tuple[bool, list[str]]:
    errors: list[str] = []
    for f in ["title", "app", "appIcon", "appColor", "appColorSecondary",
              "steps", "completionMessage", "coinsReward"]:
        if f not in sim:
            errors.append(f"Missing top-level field: '{f}'")
    steps = sim.get("steps", [])
    if not isinstance(steps, list) or not steps:
        errors.append("'steps' must be a non-empty list")
    else:
        for i, step in enumerate(steps):
            for sf in ["id", "title", "instruction", "uiElement"]:
                if sf not in step:
                    errors.append(f"Step {i+1}: missing field '{sf}'")
            if "uiElement" in step:
                errors.extend(_validate_ui_element(step["uiElement"], i + 1))
    if not isinstance(sim.get("coinsReward", 0), (int, float)):
        errors.append("'coinsReward' must be a number")
    return len(errors) == 0, errors


def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        lines = lines[1:] if lines[0].startswith("```") else lines
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _detect_fraud(prompt: str) -> Optional[str]:
    lower = prompt.lower()
    for kw, warn in FRAUD_PATTERNS.items():
        if kw in lower:
            return warn
    return None


# ── Smart option fallbacks per app + UI type ──────────────────────────────────
_APP_OPTIONS: dict[str, dict[str, list[str]]] = {
    "google pay":  {"home_screen": ["New Payment","Pay Contacts","Scan QR","History"]},
    "gpay":        {"home_screen": ["New Payment","Pay Contacts","Scan QR","History"]},
    "phonepe":     {"home_screen": ["Send Money","Recharge","Pay Bills","UPI"]},
    "paytm":       {"home_screen": ["Pay / Send","Recharge","Pay Bills","Passbook"]},
    "irctc":       {"home_screen": ["Book Ticket","My Bookings","Train Search","PNR Status"]},
    "atm machine": {"atm_screen":  ["Withdraw Cash","Balance Enquiry","Mini Statement","Change PIN"]},
    "atm":         {"atm_screen":  ["Withdraw Cash","Balance Enquiry","Mini Statement","Change PIN"]},
    "sbi":         {"bank_dashboard": ["Transfer Money","Check Balance","Pay Bills","Statements"]},
    "hdfc":        {"bank_dashboard": ["Transfer Money","Check Balance","Pay Bills","Statements"]},
    "electricity": {"home_screen": ["Pay Bill","View Bill","Complaint","History"]},
    "mobile recharge": {"home_screen": ["Mobile Recharge","DTH Recharge","Data Pack","History"]},
}

_GENERIC_OPTIONS: dict[str, list[str]] = {
    "home_screen":    ["Get Started","View Services","My Account","Help"],
    "contact_list":   ["Priya Sharma","Ravi Kumar","Anita Singh","Suresh Patel"],
    "atm_screen":     ["Withdraw Cash","Balance Enquiry","Mini Statement","Change PIN"],
    "bank_dashboard": ["Send Money","Check Balance","Pay Bills","Statements"],
    "menu_list":      ["Option 1","Option 2","Option 3","Option 4"],
    "ticket_booking": ["New Delhi","Mumbai Central"],
    "confirmation":   ["Amount: ₹500","To: Recipient","Via: UPI"],
}

def _enrich_options(sim: dict) -> dict:
    """Ensure no list-type uiElement has an empty options array."""
    app_lower = sim.get("app", "").lower()
    for step in sim.get("steps", []):
        el = step.get("uiElement", {})
        ui_type = el.get("type", "")
        if not el.get("options"):
            # Try app-specific first
            app_opts = None
            for app_key, type_map in _APP_OPTIONS.items():
                if app_key in app_lower:
                    app_opts = type_map.get(ui_type)
                    break
            if app_opts:
                el["options"] = app_opts
            elif ui_type in _GENERIC_OPTIONS:
                el["options"] = _GENERIC_OPTIONS[ui_type]
    return sim


def _fallback_from_dataset(prompt: str) -> Optional[dict]:
    """Keyword-score the dataset and return the best match."""
    dataset = _load_dataset()
    if not dataset:
        return None
    lower  = prompt.lower()
    scored: list[tuple[int, dict]] = []
    for sim in dataset:
        score       = 0
        app_lower   = sim.get("app", "").lower()
        title_lower = sim.get("title", "").lower()
        for word in lower.split():
            if len(word) < 3:
                continue
            if word in app_lower or word in title_lower:
                score += 3
            for step in sim.get("steps", []):
                if word in step.get("instruction", "").lower():
                    score += 1
        if score > 0:
            scored.append((score, sim))
    if scored:
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    return random.choice(dataset)

# ── Core generator ────────────────────────────────────────────────────────────

def _build_simulation(prompt: str) -> tuple[dict, str]:
    """
    Returns (simulation_dict, source) where source in {"groq", "dataset"}.
    Falls back to dataset on any Groq failure.
    Raises ValueError only when both paths fail.
    """
    try:
        client     = _get_client()
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.5,    # lower = more deterministic / follows rules better
            max_tokens=1800,
        )
        raw  = completion.choices[0].message.content or ""
        text = _strip_fences(raw)

        # Extract JSON if there is preamble text
        if not text.startswith("{"):
            start = text.find("{")
            end   = text.rfind("}") + 1
            if start != -1 and end > start:
                text = text[start:end]

        sim = json.loads(text)
        ok, errors = _validate_simulation(sim)
        if not ok:
            raise ValueError(f"Groq output invalid: {'; '.join(errors)}")

        # Enrich: fill empty options, add fraud warning
        sim = _enrich_options(sim)
        if not sim.get("fraudWarning"):
            detected = _detect_fraud(prompt)
            if detected:
                sim["fraudWarning"] = detected
        sim["coinsReward"] = int(sim.get("coinsReward", 15))
        return sim, "groq"

    except (APIConnectionError, RateLimitError, APIStatusError,
            ValueError, json.JSONDecodeError) as exc:
        logger.warning("Groq failed (%s). Falling back to sim.json dataset.", exc)
        fallback = _fallback_from_dataset(prompt)
        if fallback:
            fallback = _enrich_options(fallback)
            if not fallback.get("fraudWarning"):
                detected = _detect_fraud(prompt)
                if detected:
                    fallback["fraudWarning"] = detected
            return fallback, "dataset"
        raise ValueError("Both Groq generation and sim.json fallback failed.") from exc

# ── Routes ────────────────────────────────────────────────────────────────────

@sim_bp.route("/generate", methods=["POST"])
def generate_simulation():
    """POST /api/sim/generate  Body: { "prompt": "..." }"""
    body   = request.get_json(silent=True) or {}
    prompt = (body.get("prompt") or "").strip()

    if not prompt:
        return jsonify({"error": "Request body must include a non-empty 'prompt' field."}), 400
    if len(prompt) > 1000:
        return jsonify({"error": "Prompt too long — keep it under 1000 characters."}), 400

    t0 = time.time()
    try:
        simulation, source = _build_simulation(prompt)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422
    except RuntimeError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:
        logger.exception("Unexpected error: %s", exc)
        return jsonify({"error": "An unexpected server error occurred."}), 500

    elapsed = round(time.time() - t0, 3)
    sim_id  = str(uuid.uuid4())

    _simulation_store.append({
        "id":           sim_id,
        "prompt":       prompt,
        "simulation":   simulation,
        "source":       source,
        "generated_at": datetime.utcnow().isoformat(),
        "elapsed_s":    elapsed,
    })
    if len(_simulation_store) > 100:
        _simulation_store.pop(0)

    return jsonify({
        "simulation": simulation,
        "meta": {"simulation_id": sim_id, "elapsed_s": elapsed, "source": source},
    }), 200


@sim_bp.route("/analytics", methods=["POST"])
def track_analytics():
    """POST /api/sim/analytics"""
    body   = request.get_json(silent=True) or {}
    EVENTS = {"simulation_start", "step_complete", "fraud_tip_viewed", "simulation_complete"}
    event  = (body.get("event") or "").strip()
    if event not in EVENTS:
        return jsonify({"error": f"event must be one of: {', '.join(EVENTS)}"}), 400

    record = {
        "id":            str(uuid.uuid4()),
        "simulation_id": body.get("simulation_id"),
        "event":         event,
        "step_index":    body.get("step_index"),
        "time_spent_ms": body.get("time_spent_ms"),
        "extra":         body.get("extra", {}),
        "recorded_at":   datetime.utcnow().isoformat(),
    }
    _analytics_store.append(record)
    if len(_analytics_store) > 5000:
        _analytics_store.pop(0)
    return jsonify({"status": "recorded", "event_id": record["id"]}), 201


@sim_bp.route("/analytics/summary", methods=["GET"])
def analytics_summary():
    from collections import Counter
    counts      = Counter(r["event"] for r in _analytics_store)
    completions = counts.get("simulation_complete", 0)
    starts      = max(counts.get("simulation_start", 1), 1)
    return jsonify({
        "total_events":        len(_analytics_store),
        "event_breakdown":     dict(counts),
        "completion_rate_pct": round(completions / starts * 100, 1),
        "simulations_stored":  len(_simulation_store),
        "templates_stored":    len(_template_store),
    }), 200


@sim_bp.route("/templates", methods=["GET"])
def list_templates():
    summaries = [
        {
            "id":          t["id"],
            "title":       t["simulation"]["title"],
            "app":         t["simulation"]["app"],
            "appIcon":     t["simulation"]["appIcon"],
            "steps_count": len(t["simulation"]["steps"]),
            "saved_at":    t["saved_at"],
            "recommended": t.get("recommended", False),
        }
        for t in _template_store
    ]
    return jsonify({"templates": summaries}), 200


@sim_bp.route("/templates", methods=["POST"])
def save_template():
    body = request.get_json(silent=True) or {}
    sim  = body.get("simulation")
    if not sim:
        return jsonify({"error": "'simulation' field is required."}), 400
    ok, errors = _validate_simulation(sim)
    if not ok:
        return jsonify({"error": "Invalid simulation JSON.", "details": errors}), 422
    record = {
        "id":          str(uuid.uuid4()),
        "simulation":  sim,
        "recommended": bool(body.get("recommended", False)),
        "saved_at":    datetime.utcnow().isoformat(),
    }
    _template_store.append(record)
    return jsonify({"status": "saved", "template_id": record["id"]}), 201


@sim_bp.route("/templates/<tid>", methods=["GET"])
def get_template(tid: str):
    for t in _template_store:
        if t["id"] == tid:
            return jsonify({"template": t}), 200
    return jsonify({"error": "Template not found."}), 404


@sim_bp.route("/templates/<tid>", methods=["PATCH"])
def update_template(tid: str):
    body = request.get_json(silent=True) or {}
    for t in _template_store:
        if t["id"] == tid:
            if "recommended"  in body: t["recommended"]               = bool(body["recommended"])
            if "coinsReward"  in body: t["simulation"]["coinsReward"] = int(body["coinsReward"])
            if "fraudWarning" in body: t["simulation"]["fraudWarning"]= body["fraudWarning"] or None
            return jsonify({"status": "updated", "template": t}), 200
    return jsonify({"error": "Template not found."}), 404


@sim_bp.route("/templates/<tid>", methods=["DELETE"])
def delete_template(tid: str):
    global _template_store
    before = len(_template_store)
    _template_store = [t for t in _template_store if t["id"] != tid]
    if len(_template_store) < before:
        return jsonify({"status": "deleted"}), 200
    return jsonify({"error": "Template not found."}), 404


@sim_bp.route("/validate", methods=["POST"])
def validate_endpoint():
    body = request.get_json(silent=True) or {}
    sim  = body.get("simulation")
    if not sim:
        return jsonify({"error": "'simulation' field is required."}), 400
    ok, errors = _validate_simulation(sim)
    return jsonify({"valid": ok, "errors": errors}), (200 if ok else 422)


@sim_bp.route("/dataset/random", methods=["GET"])
def dataset_random():
    """GET /api/sim/dataset/random?app=GPay"""
    dataset    = _load_dataset()
    if not dataset:
        return jsonify({"error": "Dataset not available — sim.json missing."}), 503
    app_filter = request.args.get("app", "").lower()
    pool = [s for s in dataset if app_filter in s.get("app", "").lower()] if app_filter else dataset
    sim  = _enrich_options(random.choice(pool or dataset))
    return jsonify({"simulation": sim}), 200