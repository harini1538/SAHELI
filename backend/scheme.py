"""
schemes.py — Blueprint for all scheme-related API endpoints
------------------------------------------------------------
Engines implemented
  1. Scheme Discovery Engine   GET  /api/schemes
  2. Scheme Detail Retrieval   GET  /api/schemes/<int:scheme_id>
  3. Eligibility Engine        POST /api/schemes/eligibility
  4. Comparison Engine         POST /api/schemes/compare
  5. Application Tracker       GET  /api/tracker
  6. AI Scheme Assistant       POST /api/chat
  7. Recommendation Engine     POST /api/schemes/recommend

Security
  • Input validation & sanitization on every endpoint
  • Rate limiting: 100 req / 60 s per IP  (in-memory sliding window)
  • Groq API key read from GROQ_API_KEY env-var only — never exposed

Install extras:
  pip install groq
"""

import os
import re
import time
import json
import string
import uuid
from collections import defaultdict
from functools import wraps
from datetime import datetime

from flask import Blueprint, request, jsonify
from groq import Groq

# ── Blueprint ─────────────────────────────────────────────────────────────────
schemes_bp = Blueprint("schemes", __name__, url_prefix="/api")

# ── Groq client (lazy — only created when AI endpoint is hit) ─────────────────
_groq_client = None

def get_groq():
    global _groq_client
    if _groq_client is None:
        api_key = os.environ.get("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("GROQ_API_KEY environment variable is not set.")
        _groq_client = Groq(api_key=api_key)
    return _groq_client

# ── Dataset — loaded once into memory at import time ─────────────────────────
_DATASET_PATH = os.path.join(os.path.dirname(__file__), "india_central_state_schemes_1500.json")

def _load_schemes() -> list[dict]:
    """Load JSON dataset into memory. Falls back to empty list on error."""
    try:
        with open(_DATASET_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Normalise: ensure every scheme has the fields the engines expect
        for i, s in enumerate(data):
            s.setdefault("id", i + 1)
            s.setdefault("tags", [])
            s.setdefault("category", "General")
            s.setdefault("ministry", "Government of India")
            s.setdefault("deadline", "Open")
            s.setdefault("launchYear", 2020)
            s.setdefault("beneficiaries", "N/A")
            s.setdefault("benefit", "")
            s.setdefault("purpose", "")
            s.setdefault("benefits", [])
            s.setdefault("docs", [])
            s.setdefault("steps", [])
            s.setdefault("link", "https://www.india.gov.in")
            s.setdefault("timeline", "15–45 working days")
            s.setdefault("fraudTips", [])
            s.setdefault("successStory", "")
            s.setdefault("eligibility", {"minAge": 0, "maxAge": 100, "maxIncome": None})
            # View counter (in-memory analytics)
            s.setdefault("_views", 0)
        return data
    except FileNotFoundError:
        print(f"[WARN] Dataset not found at {_DATASET_PATH}. Using empty list.")
        return []
    except json.JSONDecodeError as e:
        print(f"[ERROR] JSON decode error: {e}")
        return []

SCHEMES: list[dict] = _load_schemes()

# Fast lookup by id
_SCHEME_BY_ID: dict[int, dict] = {s["id"]: s for s in SCHEMES}

VALID_CATEGORIES = {
    "All", "Business", "Savings", "Education", "Agriculture",
    "Health", "Welfare", "Housing", "Skill Development"
}

VALID_STATES = {
    "All India", "Maharashtra", "Karnataka", "Tamil Nadu", "Uttar Pradesh",
    "Rajasthan", "West Bengal", "Gujarat", "Bihar", "Odisha",
    "Andhra Pradesh", "Telangana", "Madhya Pradesh", "Punjab", "Haryana",
    "Kerala", "Assam", "Jharkhand", "Chhattisgarh", "Tripura"
}

# ── Mock application tracker store (in-memory per session — replace with DB) ──
_TRACKER_STORE: dict[str, list[dict]] = {
    "default_user": [
        {
            "app_id": "MUDRA2024-78312",
            "scheme_id": 1,
            "scheme_name": "PM Mudra Yojana",
            "current_stage": 3,
            "status": "Bank Appraisal",
            "stages": ["Applied", "Doc Review", "Bank Appraisal", "Sanctioned", "Disbursed"],
            "created_at": "2024-11-01",
            "updated_at": "2024-11-18",
        },
        {
            "app_id": "PMJAY2024-11923",
            "scheme_id": 6,
            "scheme_name": "Ayushman Bharat – PMJAY",
            "current_stage": 4,
            "status": "Activated",
            "stages": ["Applied", "Verified", "Card Generated", "Activated", "Active"],
            "created_at": "2024-10-15",
            "updated_at": "2024-11-20",
        },
    ]
}

# ── Rate limiting (in-memory sliding window, 100 req/60 s per IP) ─────────────
_RATE_STORE: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT  = 100
RATE_WINDOW = 60  # seconds


def _check_rate_limit(ip: str) -> bool:
    now = time.time()
    cutoff = now - RATE_WINDOW
    hits = [t for t in _RATE_STORE[ip] if t > cutoff]
    if len(hits) >= RATE_LIMIT:
        return False
    hits.append(now)
    _RATE_STORE[ip] = hits
    return True


def rate_limited(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        ip = request.remote_addr or "unknown"
        if not _check_rate_limit(ip):
            return jsonify({"error": "Rate limit exceeded. Try again in a minute."}), 429
        return f(*args, **kwargs)
    return wrapper


# ── Sanitization helpers ──────────────────────────────────────────────────────
_ALLOWED_SEARCH_CHARS = re.compile(r"[^\w\s\-₹]", re.UNICODE)

def sanitize_query(raw: str) -> str:
    """Strip dangerous characters; keep letters, digits, spaces, hyphens, ₹."""
    if not isinstance(raw, str):
        return ""
    cleaned = _ALLOWED_SEARCH_CHARS.sub("", raw)
    return cleaned[:200].strip()  # hard cap at 200 chars

def validate_int(value, min_val: int = 0, max_val: int = 10_000_000, default: int = 0) -> int:
    try:
        v = int(value)
        return max(min_val, min(max_val, v))
    except (TypeError, ValueError):
        return default

def validate_category(cat: str) -> str:
    return cat if cat in VALID_CATEGORIES else "All"

def validate_state(state: str) -> str:
    return state if state in VALID_STATES else "All India"


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 1 — SCHEME DISCOVERY
#  GET /api/schemes?q=&category=&page=1&limit=20
# ═══════════════════════════════════════════════════════════════════════════════
def _score_scheme(scheme: dict, keywords: list[str]) -> int:
    """Relevance score for keyword search."""
    if not keywords:
        return 1  # no query → all schemes match equally

    score = 0
    name    = scheme.get("name", "").lower()
    benefit = scheme.get("benefit", "").lower()
    purpose = scheme.get("purpose", "").lower()
    tags    = [t.lower() for t in scheme.get("tags", [])]
    cat     = scheme.get("category", "").lower()

    for kw in keywords:
        kw = kw.lower()
        if kw in name:
            score += 3
        if any(kw in t for t in tags):
            score += 2
        if kw in benefit:
            score += 1
        if kw in purpose:
            score += 1
        if kw in cat:
            score += 1

    return score


@schemes_bp.route("/schemes", methods=["GET"])
@rate_limited
def get_schemes():
    """
    Discovery engine — search, filter, paginate.
    Query params:
      q        : search string
      category : filter by category
      page     : page number (default 1)
      limit    : results per page (default 20, max 100)
    """
    raw_query    = request.args.get("q", "")
    raw_category = request.args.get("category", "All")
    raw_page     = request.args.get("page", 1)
    raw_limit    = request.args.get("limit", 20)

    # Sanitize & validate
    query    = sanitize_query(raw_query)
    category = validate_category(str(raw_category))
    page     = validate_int(raw_page, min_val=1, max_val=500, default=1)
    limit    = validate_int(raw_limit, min_val=1, max_val=100, default=20)

    # Normalize query into keywords
    keywords = re.sub(r"[^\w\s]", "", query).lower().split() if query else []

    # Step 1 — Category filter
    pool = [s for s in SCHEMES if category == "All" or s["category"] == category]

    # Step 2 — Keyword scoring
    if keywords:
        scored = [(s, _score_scheme(s, keywords)) for s in pool]
        scored = [(s, sc) for s, sc in scored if sc > 0]
        scored.sort(key=lambda x: x[1], reverse=True)
        pool = [s for s, _ in scored]

    total = len(pool)

    # Step 3 — Pagination
    start = (page - 1) * limit
    end   = start + limit
    page_data = pool[start:end]

    # Step 4 — Strip heavy fields for list view
    results = [
        {
            "id":            s["id"],
            "name":          s["name"],
            "benefit":       s["benefit"],
            "category":      s["category"],
            "tags":          s["tags"][:4],
            "ministry":      s["ministry"],
            "deadline":      s["deadline"],
            "launchYear":    s["launchYear"],
            "beneficiaries": s["beneficiaries"],
            "eligibility":   s["eligibility"],
            "timeline":      s["timeline"],
        }
        for s in page_data
    ]

    return jsonify({
        "results":   results,
        "total":     total,
        "page":      page,
        "limit":     limit,
        "pages":     (total + limit - 1) // limit,
        "query":     query,
        "category":  category,
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 2 — SCHEME DETAIL
#  GET /api/schemes/<id>
# ═══════════════════════════════════════════════════════════════════════════════
@schemes_bp.route("/schemes/<int:scheme_id>", methods=["GET"])
@rate_limited
def get_scheme_detail(scheme_id: int):
    """Return full scheme detail and increment view counter."""
    scheme = _SCHEME_BY_ID.get(scheme_id)
    if not scheme:
        return jsonify({"error": f"Scheme {scheme_id} not found."}), 404

    # Analytics: increment view counter
    scheme["_views"] = scheme.get("_views", 0) + 1

    # Return full object (exclude internal _views key in clean copy)
    detail = {k: v for k, v in scheme.items() if not k.startswith("_")}
    detail["views"] = scheme["_views"]  # expose as public field
    return jsonify(detail)


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 3 — ELIGIBILITY EVALUATION
#  POST /api/schemes/eligibility
#  Body: { age, income, state, interest }
# ═══════════════════════════════════════════════════════════════════════════════
@schemes_bp.route("/schemes/eligibility", methods=["POST"])
@rate_limited
def check_eligibility():
    """Return schemes the user is eligible for, ranked by relevance score."""
    body = request.get_json(silent=True) or {}

    # Validate inputs
    age      = validate_int(body.get("age"), min_val=0, max_val=120, default=0)
    income   = validate_int(body.get("income"), min_val=0, max_val=100_000_000, default=0)
    state    = validate_state(str(body.get("state", "All India")))
    interest = validate_category(str(body.get("interest", "All")))

    if age == 0:
        return jsonify({"error": "Valid age (1–120) is required."}), 400

    eligible = []

    for s in SCHEMES:
        e = s.get("eligibility", {})
        min_age    = validate_int(e.get("minAge"), default=0)
        max_age    = validate_int(e.get("maxAge"), default=100)
        max_income = e.get("maxIncome")  # None means no cap

        # Age check
        if not (min_age <= age <= max_age):
            continue

        # Income check
        if max_income is not None and income > int(max_income):
            continue

        # Interest / category check
        if interest != "All" and s.get("category") != interest:
            continue

        # Relevance scoring for ranking
        score = 0
        if interest != "All" and s.get("category") == interest:
            score += 3
        if state != "All India":
            score += 2  # no state field in dataset — treat all as eligible
        if min_age <= age <= max_age:
            score += 1
        if max_income is None or income <= max_income:
            score += 1

        eligible.append((s, score))

    # Sort by score descending
    eligible.sort(key=lambda x: x[1], reverse=True)

    results = [
        {
            "id":          s["id"],
            "name":        s["name"],
            "benefit":     s["benefit"],
            "category":    s["category"],
            "tags":        s["tags"][:4],
            "ministry":    s["ministry"],
            "deadline":    s["deadline"],
            "eligibility": s["eligibility"],
            "timeline":    s["timeline"],
            "score":       score,
        }
        for s, score in eligible
    ]

    return jsonify({
        "count":    len(results),
        "results":  results,
        "profile":  {"age": age, "income": income, "state": state, "interest": interest},
    })


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 4 — COMPARISON ENGINE
#  POST /api/schemes/compare
#  Body: { ids: [1, 2, 3] }
# ═══════════════════════════════════════════════════════════════════════════════
@schemes_bp.route("/schemes/compare", methods=["POST"])
@rate_limited
def compare_schemes():
    """Return comparable attributes for 2–3 scheme IDs."""
    body = request.get_json(silent=True) or {}
    raw_ids = body.get("ids", [])

    if not isinstance(raw_ids, list):
        return jsonify({"error": "'ids' must be a list."}), 400

    # Validate: 2–3 IDs, all integers
    ids = []
    for v in raw_ids[:3]:
        try:
            ids.append(int(v))
        except (TypeError, ValueError):
            pass

    if len(ids) < 2:
        return jsonify({"error": "Provide 2–3 valid scheme IDs to compare."}), 400

    results = []
    for sid in ids:
        s = _SCHEME_BY_ID.get(sid)
        if not s:
            return jsonify({"error": f"Scheme ID {sid} not found."}), 404
        e = s.get("eligibility", {})
        results.append({
            "id":            s["id"],
            "name":          s["name"],
            "category":      s["category"],
            "benefit":       s["benefit"],
            "ministry":      s["ministry"],
            "launchYear":    s["launchYear"],
            "beneficiaries": s["beneficiaries"],
            "timeline":      s["timeline"],
            "minAge":        e.get("minAge", 0),
            "maxAge":        e.get("maxAge", 100),
            "maxIncome":     e.get("maxIncome"),
            "tags":          s["tags"],
            "deadline":      s["deadline"],
            "link":          s["link"],
        })

    return jsonify({"count": len(results), "schemes": results})


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 5 — APPLICATION TRACKER
#  GET  /api/tracker?user_id=default_user
#  POST /api/tracker   — add a new tracked application
# ═══════════════════════════════════════════════════════════════════════════════
@schemes_bp.route("/tracker", methods=["GET"])
@rate_limited
def get_tracker():
    """Return tracked applications for a user."""
    user_id = sanitize_query(request.args.get("user_id", "default_user")) or "default_user"
    items   = _TRACKER_STORE.get(user_id, [])
    return jsonify({"user_id": user_id, "count": len(items), "applications": items})


@schemes_bp.route("/tracker", methods=["POST"])
@rate_limited
def add_tracker():
    """Add a new scheme application to the tracker."""
    body = request.get_json(silent=True) or {}

    scheme_id = validate_int(body.get("scheme_id"), min_val=1, max_val=99999, default=0)
    user_id   = sanitize_query(str(body.get("user_id", "default_user"))) or "default_user"

    if scheme_id == 0:
        return jsonify({"error": "Valid scheme_id is required."}), 400

    scheme = _SCHEME_BY_ID.get(scheme_id)
    if not scheme:
        return jsonify({"error": f"Scheme {scheme_id} not found."}), 404

    app_id = f"{scheme['name'].split()[0].upper()}{datetime.now().year}-{uuid.uuid4().hex[:5].upper()}"
    new_app = {
        "app_id":        app_id,
        "scheme_id":     scheme_id,
        "scheme_name":   scheme["name"],
        "current_stage": 0,
        "status":        "Applied",
        "stages":        ["Applied", "Doc Review", "Verification", "Approved", "Disbursed"],
        "created_at":    datetime.now().strftime("%Y-%m-%d"),
        "updated_at":    datetime.now().strftime("%Y-%m-%d"),
    }

    if user_id not in _TRACKER_STORE:
        _TRACKER_STORE[user_id] = []
    _TRACKER_STORE[user_id].append(new_app)

    return jsonify({"message": "Application tracked successfully.", "application": new_app}), 201


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 6 — AI SCHEME ASSISTANT (Groq)
#  POST /api/chat
#  Body: { messages: [{role, content}, ...] }
# ═══════════════════════════════════════════════════════════════════════════════
def _detect_scheme_context(text: str) -> str:
    """If user mentions a scheme keyword, inject its data as context."""
    text_lower = text.lower()
    # Keyword → scheme name fragments
    keyword_map = {
        "mudra":       "PM Mudra Yojana",
        "sukanya":     "Sukanya Samriddhi",
        "standup":     "Stand-Up India",
        "stand up":    "Stand-Up India",
        "pmgdisha":    "Digital Saksharta",
        "digital":     "Digital Saksharta",
        "fasal":       "PM Fasal Bima",
        "crop":        "PM Fasal Bima",
        "ayushman":    "Ayushman Bharat",
        "pmjay":       "Ayushman Bharat",
        "health":      "Ayushman Bharat",
    }
    for kw, scheme_fragment in keyword_map.items():
        if kw in text_lower:
            # Find matching scheme in dataset
            for s in SCHEMES:
                if scheme_fragment.lower() in s["name"].lower():
                    e = s.get("eligibility", {})
                    return (
                        f"\n\n[Relevant Scheme Context]\n"
                        f"Name: {s['name']}\n"
                        f"Benefit: {s['benefit']}\n"
                        f"Category: {s['category']}\n"
                        f"Ministry: {s['ministry']}\n"
                        f"Eligibility: Age {e.get('minAge',0)}–{e.get('maxAge',100)}, "
                        f"Max Income: {'No limit' if not e.get('maxIncome') else '₹' + str(e['maxIncome'])}\n"
                        f"Timeline: {s['timeline']}\n"
                        f"Apply at: {s['link']}\n"
                    )
    return ""


SYSTEM_PROMPT = """You are a warm, knowledgeable Indian government scheme advisor named SchemeNav AI.

Your role:
- Help citizens discover, understand, and apply for government welfare schemes
- Explain eligibility criteria, required documents, and application steps clearly
- Be empathetic, concise, and use simple language (assume varying literacy levels)
- Always use ₹ for Indian currency
- Keep responses under 150 words unless a detailed explanation is specifically needed
- If the user asks about eligibility, ask for their age, income, and state if not provided
- Warn users to only use official government portals and never pay middlemen
- You are aware of 1500+ Central and State government schemes across Business, Health, Agriculture, Education, Savings, Housing, Welfare, and Skill Development categories

Safety rules:
- Never encourage illegal activities
- Always recommend official channels
- If a user seems to be in financial distress, be extra supportive and list the most relevant schemes
"""


@schemes_bp.route("/chat", methods=["POST"])
@schemes_bp.route("/schemes/chat", methods=["POST"])
@rate_limited
def chat():
    """AI Scheme Assistant powered by Groq LLM."""
    body = request.get_json(silent=True) or {}
    messages = body.get("messages", [])

    if not isinstance(messages, list) or len(messages) == 0:
        return jsonify({"error": "messages array is required."}), 400

    # Validate message format; keep last 20 turns to avoid token overflow
    clean_messages = []
    for m in messages[-20:]:
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str):
            content = m["content"][:2000]  # hard cap per message
            clean_messages.append({"role": m["role"], "content": content})

    if not clean_messages:
        return jsonify({"error": "No valid messages provided."}), 400

    # Inject scheme context into last user message if relevant
    last_user = next((m for m in reversed(clean_messages) if m["role"] == "user"), None)
    scheme_context = ""
    if last_user:
        scheme_context = _detect_scheme_context(last_user["content"])
        if scheme_context:
            # Append context to last user message
            last_user["content"] += scheme_context

    try:
        groq = get_groq()
        response = groq.chat.completions.create(
            model="llama-3.1-8b-instant",  # current fast Groq model (llama3-8b-8192 deprecated)
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + clean_messages,
            max_tokens=400,
            temperature=0.65,
        )
        reply = response.choices[0].message.content.strip()
    except RuntimeError as e:
        return jsonify({"error": str(e)}), 503
    except Exception as e:
        return jsonify({"error": "AI service temporarily unavailable. Please try again shortly."}), 503

    return jsonify({"reply": reply})


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE 7 — RECOMMENDATION ENGINE
#  POST /api/schemes/recommend
#  Body: { age, income, state, interest }  → top 5 personalised schemes
# ═══════════════════════════════════════════════════════════════════════════════
@schemes_bp.route("/schemes/recommend", methods=["POST"])
@rate_limited
def recommend_schemes():
    """Return top-5 recommended schemes based on user profile."""
    body = request.get_json(silent=True) or {}

    age      = validate_int(body.get("age"), min_val=0, max_val=120, default=0)
    income   = validate_int(body.get("income"), min_val=0, max_val=100_000_000, default=0)
    state    = validate_state(str(body.get("state", "All India")))
    interest = validate_category(str(body.get("interest", "All")))

    scored = []
    for s in SCHEMES:
        score = 0
        e = s.get("eligibility", {})
        min_age    = validate_int(e.get("minAge"), default=0)
        max_age    = validate_int(e.get("maxAge"), default=100)
        max_income = e.get("maxIncome")

        # Category match → highest weight
        if interest != "All" and s.get("category") == interest:
            score += 4
        elif interest == "All":
            score += 1

        # State context (dataset has no state field → all treated as central)
        if state != "All India":
            score += 2

        # Income eligibility
        if max_income is None or (income > 0 and income <= int(max_income)):
            score += 2

        # Age eligibility
        if age > 0 and min_age <= age <= max_age:
            score += 1

        # Popularity boost (proxy: id-based deterministic noise)
        score += (s["id"] * 3 + 7) % 5  # 0–4 bonus

        if score > 0:
            scored.append((s, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    top5 = scored[:5]

    results = [
        {
            "id":          s["id"],
            "name":        s["name"],
            "benefit":     s["benefit"],
            "category":    s["category"],
            "tags":        s["tags"][:4],
            "ministry":    s["ministry"],
            "deadline":    s["deadline"],
            "eligibility": s["eligibility"],
            "timeline":    s["timeline"],
            "score":       score,
        }
        for s, score in top5
    ]

    return jsonify({
        "count":   len(results),
        "results": results,
        "profile": {"age": age, "income": income, "state": state, "interest": interest},
    })


# ── Analytics — most-viewed schemes ──────────────────────────────────────────
@schemes_bp.route("/schemes/analytics/popular", methods=["GET"])
@rate_limited
def popular_schemes():
    """Return top-10 most-viewed schemes (in-memory analytics)."""
    ranked = sorted(SCHEMES, key=lambda s: s.get("_views", 0), reverse=True)[:10]
    return jsonify([
        {"id": s["id"], "name": s["name"], "category": s["category"], "views": s.get("_views", 0)}
        for s in ranked
    ])
