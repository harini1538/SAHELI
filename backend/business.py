"""
business.py — AI-Driven Business Growth Studio Blueprint
---------------------------------------------------------
Mounts at /api/business/*

Endpoints:
  POST /api/business/analyze         — Master AI engine: generates ALL modules
  POST /api/business/funding/search  — Web-search real funding sources for the idea
  GET  /api/business/config          — Full config read
  POST /api/business/modules         — Module CRUD
  POST /api/business/canvas          — Canvas CRUD
  POST /api/business/cost            — Cost CRUD
  POST /api/business/decision        — Decision CRUD
  POST /api/business/risk            — Risk CRUD
  POST /api/business/funding         — Funding CRUD
  POST /api/business/pitch           — Pitch config
  POST /api/business/pitch/feedback  — AI pitch evaluation
  GET/POST /api/business/mentor/prompts
  POST /api/business/mentor/ask
  GET/POST /api/business/roadmap
"""

import os
import json
import re
import urllib.request
import urllib.parse
from flask import Blueprint, request, jsonify
from groq import Groq

business_bp = Blueprint("business", __name__, url_prefix="/api/business")

# ─────────────────────────────────────────────────────────────────────────────
# In-memory store
# ─────────────────────────────────────────────────────────────────────────────

_config = {
    "idea": "",
    "modules": [
        {"id": "canvas",   "label": "💡 Idea Canvas"},
        {"id": "cost",     "label": "📊 Cost Planner"},
        {"id": "decision", "label": "🎯 Decision Sim"},
        {"id": "risk",     "label": "⚠️ Risk Awareness"},
        {"id": "funding",  "label": "💰 Funding Explorer"},
        {"id": "pitch",    "label": "🎤 Pitch Practice"},
    ],
    "canvas_blocks": ["Problem", "Solution", "Target Audience", "Revenue Model", "Unique Value"],
    "canvas_data":   {},
    # cost_items now stores objects: {label, estimated_min, estimated_max}
    "cost_items": [
        {"label": "Rent / Workspace",  "estimated_min": 5000,  "estimated_max": 15000},
        {"label": "Equipment",          "estimated_min": 10000, "estimated_max": 50000},
        {"label": "Marketing",          "estimated_min": 3000,  "estimated_max": 10000},
        {"label": "Inventory",          "estimated_min": 5000,  "estimated_max": 20000},
        {"label": "Licenses",           "estimated_min": 2000,  "estimated_max": 8000},
    ],
    "decision_cards": [
        {
            "q": "Take a loan to expand?",
            "context": "Expanding quickly with borrowed capital can accelerate growth but increases financial risk.",
            "a": "Yes – Grow fast",
            "b": "No – Stay stable",
            "a_detail": "Access more resources, reach customers faster, but take on debt repayment pressure.",
            "b_detail": "Grow organically with zero debt, but slower market penetration.",
        },
        {
            "q": "Hire an employee now?",
            "context": "Hiring early frees your time but adds monthly costs before stable revenue.",
            "a": "Yes – Delegate tasks",
            "b": "No – Solo for now",
            "a_detail": "Save time, scale operations, but adds ₹10K–25K/month in salary costs.",
            "b_detail": "Lean operation, full control, but limits how much you can do.",
        },
    ],
    "risk_categories": [
        "Market Risk", "Financial Risk", "Competition",
        "Regulatory", "Technology", "Reputation",
    ],
    "funding_sources": [
        {
            "name": "MUDRA Loan",
            "type": "Government",
            "amount": "Up to ₹10L",
            "description": "PM MUDRA Yojana offers collateral-free loans for micro and small businesses.",
            "how_to_apply": "Visit any PSU bank or MUDRA portal: mudra.org.in",
            "eligibility": "Any Indian citizen starting a non-farm income-generating business",
            "url": "https://mudra.org.in",
        },
        {
            "name": "Angel Investment",
            "type": "Private",
            "amount": "₹5L–50L",
            "description": "Individual investors who fund early-stage startups in exchange for equity.",
            "how_to_apply": "Apply on platforms like LetsVenture, AngelList India, or 100X.VC",
            "eligibility": "Scalable business idea with growth potential",
            "url": "https://letsventure.com",
        },
        {
            "name": "Self-Help Group (SHG)",
            "type": "Community",
            "amount": "₹50K–5L",
            "description": "Community-based microfinance through women's SHGs linked to banks.",
            "how_to_apply": "Contact your local bank branch or NABARD district office",
            "eligibility": "Women entrepreneurs in rural/semi-urban areas",
            "url": "https://nabard.org",
        },
    ],
    "pitch": {
        "duration": 60,
        "feedback_enabled": True,
        "tips": [
            "Open with your strongest result",
            "State the problem in one sentence",
        ],
        "generated_script": "",
    },
    "mentor_prompts": [
        "How do I validate my idea with customers?",
        "What pricing strategy should I start with?",
        "How can I reduce costs in my first 3 months?",
    ],
    "roadmap": [
        "Validate Idea", "Build MVP", "First Customer",
        "Scale Operations", "Seek Funding",
    ],
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _ok(data=None, message="Success"):
    return jsonify({"status": "ok", "message": message, "data": data or {}}), 200

def _err(message, code=400):
    return jsonify({"status": "error", "message": message}), code

def _groq_client():
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    return Groq(api_key=key)

def _chat(messages, temperature=0.7, max_tokens=2048):
    client = _groq_client()
    if not client:
        return None
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
    )
    return resp.choices[0].message.content.strip()

def _extract_json(text: str) -> dict:
    cleaned = re.sub(r"```(?:json)?", "", text).strip().rstrip("`").strip()
    start = cleaned.find("{")
    end   = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"No JSON object found:\n{text[:300]}")
    return json.loads(cleaned[start : end + 1])

def _web_search(query: str, num: int = 8) -> list[dict]:
    """
    Searches using DuckDuckGo Instant Answer API (no API key needed).
    Returns list of {title, url, snippet}.
    """
    try:
        encoded = urllib.parse.quote(query)
        url = f"https://api.duckduckgo.com/?q={encoded}&format=json&no_redirect=1&no_html=1&skip_disambig=1"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=6) as r:
            data = json.loads(r.read().decode())

        results = []
        # RelatedTopics contains actual links
        for topic in data.get("RelatedTopics", []):
            if isinstance(topic, dict) and topic.get("FirstURL") and topic.get("Text"):
                results.append({
                    "title":   topic.get("Text", "")[:80],
                    "url":     topic.get("FirstURL", ""),
                    "snippet": topic.get("Text", "")[:200],
                })
            # Handle nested Topics
            for sub in topic.get("Topics", []):
                if isinstance(sub, dict) and sub.get("FirstURL") and sub.get("Text"):
                    results.append({
                        "title":   sub.get("Text", "")[:80],
                        "url":     sub.get("FirstURL", ""),
                        "snippet": sub.get("Text", "")[:200],
                    })
            if len(results) >= num:
                break
        return results[:num]
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────────────────────
# MASTER ANALYZE PROMPT  (updated: cost now includes estimates + decision context)
# ─────────────────────────────────────────────────────────────────────────────

ANALYZE_SYSTEM = """You are an expert startup analyst and entrepreneurship mentor for Indian small businesses.
Given a business idea, return ONLY a single valid JSON object (no extra text, no markdown) with this exact schema:

{
  "canvas": {
    "Problem":         "2-3 sentence description",
    "Solution":        "2-3 sentence description",
    "Target Audience": "2-3 sentence description",
    "Revenue Model":   "2-3 sentence description",
    "Unique Value":    "2-3 sentence description"
  },
  "cost_items": [
    {"label": "category name", "estimated_min": 3000, "estimated_max": 15000},
    {"label": "category name", "estimated_min": 5000, "estimated_max": 25000}
  ],
  "decision_cards": [
    {
      "q": "Short decision question?",
      "context": "1-2 sentence explanation of why this decision matters for this specific business",
      "a": "Option A – short label",
      "b": "Option B – short label",
      "a_detail": "One sentence: what choosing A means practically",
      "b_detail": "One sentence: what choosing B means practically"
    }
  ],
  "risk_categories": [
    {"label": "Risk Name", "description": "One sentence explaining this risk for this specific business"}
  ],
  "funding_sources": [
    {
      "name": "Scheme or Source Name",
      "type": "Government|Private|Community|Self",
      "amount": "₹X – ₹Y",
      "description": "One sentence about this funding option",
      "how_to_apply": "One sentence on how to apply",
      "eligibility": "Who can apply",
      "url": "actual website URL"
    }
  ],
  "pitch_script": "3-4 sentence elevator pitch",
  "pitch_tips":   ["tip1", "tip2", "tip3"],
  "mentor_prompts": ["question1?", "question2?", "question3?"],
  "roadmap": ["Step 1", "Step 2", "Step 3", "Step 4", "Step 5"]
}

STRICT RULES:
- cost_items: 5-7 items. estimated_min/max must be realistic INTEGER rupee amounts for Indian small business (e.g. 2000-50000).
- decision_cards: EXACTLY 3 cards. Each must be directly relevant to this specific business type.
- risk_categories: EXACTLY 5 items. Each must have label + description.
- funding_sources: EXACTLY 3-5 items. Include real Indian government schemes when relevant (MUDRA, Startup India, PMEGP, etc.).
- All rupee amounts as integers (no ₹ symbol in numbers).
- Return ONLY the JSON. No explanation, no markdown, no code fences."""


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/business/analyze
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/analyze", methods=["POST"])
def analyze_idea():
    body = request.get_json(force=True) or {}
    idea = body.get("idea", "").strip()
    if not idea:        return _err("idea is required")
    if len(idea) < 10:  return _err("Describe your idea in at least 10 characters")

    try:
        raw = _chat([
            {"role": "system", "content": ANALYZE_SYSTEM},
            {"role": "user",   "content": f"Business idea: {idea}"},
        ], temperature=0.7, max_tokens=2500)
        if not raw:
            _config["idea"] = idea
            return _ok({
                "idea":            _config["idea"],
                "canvas_blocks":   _config["canvas_blocks"],
                "canvas_data":     _config["canvas_data"],
                "cost_items":      _config["cost_items"],
                "decision_cards":  _config["decision_cards"],
                "risk_categories": _config["risk_categories"],
                "funding_sources": _config["funding_sources"],
                "pitch":           _config["pitch"],
                "mentor_prompts":  _config["mentor_prompts"],
                "roadmap":         _config["roadmap"],
            }, "AI unavailable, using default template")
        ai = _extract_json(raw)
    except json.JSONDecodeError as e:
        _config["idea"] = idea
        return _ok({
            "idea":            _config["idea"],
            "canvas_blocks":   _config["canvas_blocks"],
            "canvas_data":     _config["canvas_data"],
            "cost_items":      _config["cost_items"],
            "decision_cards":  _config["decision_cards"],
            "risk_categories": _config["risk_categories"],
            "funding_sources": _config["funding_sources"],
            "pitch":           _config["pitch"],
            "mentor_prompts":  _config["mentor_prompts"],
            "roadmap":         _config["roadmap"],
        }, "AI returned invalid JSON, using default template")
    except Exception as e:
        _config["idea"] = idea
        return _ok({
            "idea":            _config["idea"],
            "canvas_blocks":   _config["canvas_blocks"],
            "canvas_data":     _config["canvas_data"],
            "cost_items":      _config["cost_items"],
            "decision_cards":  _config["decision_cards"],
            "risk_categories": _config["risk_categories"],
            "funding_sources": _config["funding_sources"],
            "pitch":           _config["pitch"],
            "mentor_prompts":  _config["mentor_prompts"],
            "roadmap":         _config["roadmap"],
        }, "AI error, using default template")

    # ── Canvas ────────────────────────────────────────────────────────────
    _config["idea"]          = idea
    canvas_dict              = ai.get("canvas", {})
    _config["canvas_blocks"] = list(canvas_dict.keys()) if canvas_dict else _config["canvas_blocks"]
    _config["canvas_data"]   = canvas_dict

    # ── Cost items (now with estimates) ───────────────────────────────────
    raw_cost = ai.get("cost_items", [])
    valid_cost = []
    for c in raw_cost:
        if isinstance(c, dict) and c.get("label"):
            valid_cost.append({
                "label":         str(c.get("label",  "")).strip(),
                "estimated_min": int(c.get("estimated_min", 0)),
                "estimated_max": int(c.get("estimated_max", 0)),
            })
    if valid_cost:
        _config["cost_items"] = valid_cost

    # ── Decision cards (with context + details) ───────────────────────────
    raw_cards = ai.get("decision_cards", [])
    valid_cards = []
    for c in raw_cards:
        if isinstance(c, dict) and c.get("q") and c.get("a") and c.get("b"):
            valid_cards.append({
                "q":        c.get("q",        "").strip(),
                "context":  c.get("context",  "").strip(),
                "a":        c.get("a",        "").strip(),
                "b":        c.get("b",        "").strip(),
                "a_detail": c.get("a_detail", "").strip(),
                "b_detail": c.get("b_detail", "").strip(),
            })
    if valid_cards:
        _config["decision_cards"] = valid_cards

    # ── Risks (with descriptions) ─────────────────────────────────────────
    raw_risks = ai.get("risk_categories", [])
    valid_risks = []
    for r in raw_risks:
        if isinstance(r, dict) and r.get("label"):
            valid_risks.append({"label": r["label"].strip(), "description": r.get("description","").strip()})
        elif isinstance(r, str) and r.strip():
            valid_risks.append({"label": r.strip(), "description": ""})
    if valid_risks:
        _config["risk_categories"] = valid_risks

    # ── Funding sources (enriched) ────────────────────────────────────────
    raw_funding = ai.get("funding_sources", [])
    valid_funding = []
    for f in raw_funding:
        if isinstance(f, dict) and f.get("name") and f.get("type") and f.get("amount"):
            valid_funding.append({
                "name":         f.get("name",         "").strip(),
                "type":         f.get("type",         "").strip(),
                "amount":       f.get("amount",       "").strip(),
                "description":  f.get("description",  "").strip(),
                "how_to_apply": f.get("how_to_apply", "").strip(),
                "eligibility":  f.get("eligibility",  "").strip(),
                "url":          f.get("url",          "").strip(),
            })
    if valid_funding:
        _config["funding_sources"] = valid_funding

    # ── Pitch ─────────────────────────────────────────────────────────────
    _config["pitch"]["generated_script"] = ai.get("pitch_script", "")
    raw_tips = ai.get("pitch_tips", [])
    if raw_tips:
        _config["pitch"]["tips"] = raw_tips

    # ── Mentor prompts & roadmap ──────────────────────────────────────────
    if ai.get("mentor_prompts"):
        _config["mentor_prompts"] = ai["mentor_prompts"]
    if ai.get("roadmap"):
        _config["roadmap"] = ai["roadmap"]

    return _ok({
        "idea":            _config["idea"],
        "canvas_blocks":   _config["canvas_blocks"],
        "canvas_data":     _config["canvas_data"],
        "cost_items":      _config["cost_items"],
        "decision_cards":  _config["decision_cards"],
        "risk_categories": _config["risk_categories"],
        "funding_sources": _config["funding_sources"],
        "pitch":           _config["pitch"],
        "mentor_prompts":  _config["mentor_prompts"],
        "roadmap":         _config["roadmap"],
    }, "Idea analyzed successfully")


# ─────────────────────────────────────────────────────────────────────────────
# POST /api/business/funding/search  — Web search for real funding
# ─────────────────────────────────────────────────────────────────────────────

FUNDING_PARSE_SYSTEM = """You are a startup funding advisor for Indian small businesses.
Given a business idea and some web search snippets about funding schemes,
return ONLY a JSON array (no markdown, no extra text) of funding objects:

[
  {
    "name":         "Official scheme or source name",
    "type":         "Government|Private|Community|Self|Bank",
    "amount":       "₹X – ₹Y or 'Varies'",
    "description":  "One sentence describing this funding option",
    "how_to_apply": "One sentence on application process",
    "eligibility":  "Brief eligibility criteria",
    "url":          "Official website URL if known, else empty string"
  }
]

Return 4-6 most relevant funding options for the given business idea.
Include real Indian schemes: MUDRA, PMEGP, Startup India, Stand-Up India, CGTMSE, state-specific schemes when relevant.
Return ONLY the JSON array."""


@business_bp.route("/funding/search", methods=["POST"])
def search_funding():
    """
    Body: { "idea": "..." }
    1. Web-searches for relevant Indian funding schemes
    2. AI parses + formats results into structured funding cards
    Returns: { "funding_sources": [...] }
    """
    body = request.get_json(force=True) or {}
    idea = body.get("idea", _config.get("idea", "")).strip()
    if not idea:
        return _err("idea is required")

    # Build search queries based on idea keywords
    queries = [
        f"Indian government funding schemes small business {idea[:60]}",
        f"startup loan India {idea[:50]} MUDRA PMEGP",
        f"entrepreneurship grants India {idea[:50]}",
    ]

    all_snippets = []
    for q in queries:
        results = _web_search(q, num=4)
        for r in results:
            all_snippets.append(f"Title: {r['title']}\nSnippet: {r['snippet']}\nURL: {r['url']}")

    snippets_text = "\n\n---\n\n".join(all_snippets[:12]) if all_snippets else "No web results found."

    try:
        raw = _chat([
            {"role": "system", "content": FUNDING_PARSE_SYSTEM},
            {"role": "user",   "content": f"Business idea: {idea}\n\nWeb search results:\n{snippets_text}"},
        ], temperature=0.4, max_tokens=1500)
        if not raw:
            return _ok({"funding_sources": _config["funding_sources"]}, "AI unavailable, using default funding sources")

        # Extract JSON array
        cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
        start = cleaned.find("[")
        end   = cleaned.rfind("]")
        if start == -1 or end == -1:
            raise ValueError("No JSON array found in response")
        funding_list = json.loads(cleaned[start : end + 1])

        valid = []
        for f in funding_list:
            if isinstance(f, dict) and f.get("name") and f.get("type") and f.get("amount"):
                valid.append({
                    "name":         str(f.get("name",         "")).strip(),
                    "type":         str(f.get("type",         "")).strip(),
                    "amount":       str(f.get("amount",       "")).strip(),
                    "description":  str(f.get("description",  "")).strip(),
                    "how_to_apply": str(f.get("how_to_apply", "")).strip(),
                    "eligibility":  str(f.get("eligibility",  "")).strip(),
                    "url":          str(f.get("url",          "")).strip(),
                })
        if valid:
            _config["funding_sources"] = valid

        return _ok({"funding_sources": _config["funding_sources"]}, "Funding sources found")

    except Exception as e:
        # Fallback: return existing funding sources
        return _ok({"funding_sources": _config["funding_sources"]}, f"Using cached funding (search error: {str(e)[:60]})")


# ─────────────────────────────────────────────────────────────────────────────
# Config
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/config", methods=["GET"])
def get_config():
    return _ok(_config, "Config fetched")


# ─────────────────────────────────────────────────────────────────────────────
# Module management
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/modules", methods=["POST"])
def update_modules():
    body   = request.get_json(force=True) or {}
    action = body.get("action", "").strip()
    if action == "add":
        label = body.get("label", "").strip()
        if not label: return _err("label required")
        mod_id = label.lower().replace(" ", "-").replace("/", "-")
        if any(m["id"] == mod_id for m in _config["modules"]):
            return _err(f"Module '{mod_id}' already exists")
        _config["modules"].append({"id": mod_id, "label": label})
    elif action == "rename":
        mod_id = body.get("id","").strip(); label = body.get("label","").strip()
        if not mod_id or not label: return _err("id and label required")
        for m in _config["modules"]:
            if m["id"] == mod_id: m["label"] = label; break
        else: return _err(f"Module '{mod_id}' not found", 404)
    elif action == "remove":
        mod_id = body.get("id","").strip()
        if not mod_id: return _err("id required")
        before = len(_config["modules"])
        _config["modules"] = [m for m in _config["modules"] if m["id"] != mod_id]
        if len(_config["modules"]) == before: return _err(f"Module '{mod_id}' not found", 404)
    else:
        return _err("action must be: add, rename, remove")
    return _ok({"modules": _config["modules"]}, f"Module {action} successful")


# ─────────────────────────────────────────────────────────────────────────────
# Idea Canvas
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/canvas", methods=["GET"])
def get_canvas():
    return _ok({"canvas_blocks": _config["canvas_blocks"], "canvas_data": _config["canvas_data"]})

@business_bp.route("/canvas", methods=["POST"])
def update_canvas():
    body = request.get_json(force=True) or {}
    action = body.get("action", "set")
    if action == "add":
        block = body.get("block","").strip()
        if not block: return _err("block required")
        _config["canvas_blocks"].append(block)
    elif action == "remove":
        block = body.get("block","").strip()
        if block:
            _config["canvas_blocks"] = [b for b in _config["canvas_blocks"] if b != block]
            _config["canvas_data"].pop(block, None)
        elif _config["canvas_blocks"]:
            removed = _config["canvas_blocks"].pop()
            _config["canvas_data"].pop(removed, None)
    elif action == "set":
        blocks = body.get("blocks")
        if not isinstance(blocks, list): return _err("blocks must be list")
        _config["canvas_blocks"] = [str(b).strip() for b in blocks if str(b).strip()]
    elif action == "update_data":
        data = body.get("data", {})
        if isinstance(data, dict): _config["canvas_data"].update(data)
    else:
        return _err("action must be: add, remove, set, update_data")
    return _ok({"canvas_blocks": _config["canvas_blocks"], "canvas_data": _config["canvas_data"]}, "Canvas updated")


# ─────────────────────────────────────────────────────────────────────────────
# Cost Planner  (items are now objects with estimates)
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/cost", methods=["GET"])
def get_cost():
    return _ok({"cost_items": _config["cost_items"]})

@business_bp.route("/cost", methods=["POST"])
def update_cost():
    body   = request.get_json(force=True) or {}
    action = body.get("action", "set")
    if action == "add":
        item = body.get("item", {})
        if isinstance(item, str):
            item = {"label": item, "estimated_min": 0, "estimated_max": 0}
        if not item.get("label"): return _err("item.label required")
        _config["cost_items"].append({
            "label":         item["label"].strip(),
            "estimated_min": int(item.get("estimated_min", 0)),
            "estimated_max": int(item.get("estimated_max", 0)),
        })
    elif action == "remove":
        label = body.get("label","").strip()
        if label:
            _config["cost_items"] = [c for c in _config["cost_items"] if c.get("label") != label]
        elif _config["cost_items"]:
            _config["cost_items"].pop()
    elif action == "set":
        items = body.get("items")
        if not isinstance(items, list): return _err("items must be list")
        valid = []
        for it in items:
            if isinstance(it, str):
                valid.append({"label": it.strip(), "estimated_min": 0, "estimated_max": 0})
            elif isinstance(it, dict) and it.get("label"):
                valid.append({
                    "label":         it["label"].strip(),
                    "estimated_min": int(it.get("estimated_min", 0)),
                    "estimated_max": int(it.get("estimated_max", 0)),
                })
        _config["cost_items"] = valid
    else:
        return _err("action must be: add, remove, set")
    return _ok({"cost_items": _config["cost_items"]}, "Cost items updated")


# ─────────────────────────────────────────────────────────────────────────────
# Decision Simulator
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/decision", methods=["GET"])
def get_decision():
    return _ok({"decision_cards": _config["decision_cards"]})

@business_bp.route("/decision", methods=["POST"])
def update_decision():
    body   = request.get_json(force=True) or {}
    action = body.get("action","set")
    if action == "add":
        c = body.get("card",{})
        if not (c.get("q") and c.get("a") and c.get("b")): return _err("card needs q, a, b")
        _config["decision_cards"].append({
            "q": c["q"].strip(), "context": c.get("context","").strip(),
            "a": c["a"].strip(), "b": c["b"].strip(),
            "a_detail": c.get("a_detail","").strip(), "b_detail": c.get("b_detail","").strip(),
        })
    elif action == "remove":
        idx = body.get("index")
        if idx is not None:
            try: _config["decision_cards"].pop(int(idx))
            except IndexError: return _err("Index out of range", 404)
        elif _config["decision_cards"]: _config["decision_cards"].pop()
    elif action == "set":
        cards = body.get("cards")
        if not isinstance(cards, list): return _err("cards must be list")
        _config["decision_cards"] = [
            {
                "q": c["q"].strip(), "context": c.get("context","").strip(),
                "a": c["a"].strip(), "b": c["b"].strip(),
                "a_detail": c.get("a_detail","").strip(), "b_detail": c.get("b_detail","").strip(),
            }
            for c in cards if isinstance(c, dict) and c.get("q") and c.get("a") and c.get("b")
        ]
    else:
        return _err("action must be: add, remove, set")
    return _ok({"decision_cards": _config["decision_cards"]}, "Decision cards updated")


# ─────────────────────────────────────────────────────────────────────────────
# Risk Awareness  (risks now have description)
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/risk", methods=["GET"])
def get_risk():
    return _ok({"risk_categories": _config["risk_categories"]})

@business_bp.route("/risk", methods=["POST"])
def update_risk():
    body   = request.get_json(force=True) or {}
    action = body.get("action","set")
    if action == "add":
        label = body.get("category","").strip() or body.get("label","").strip()
        if not label: return _err("label required")
        _config["risk_categories"].append({"label": label, "description": body.get("description","").strip()})
    elif action == "remove":
        label = body.get("category","").strip() or body.get("label","").strip()
        if label:
            _config["risk_categories"] = [r for r in _config["risk_categories"] if (r if isinstance(r,str) else r.get("label","")) != label]
        elif _config["risk_categories"]: _config["risk_categories"].pop()
    elif action == "set":
        cats = body.get("categories")
        if not isinstance(cats, list): return _err("categories must be list")
        valid = []
        for c in cats:
            if isinstance(c, str) and c.strip():
                valid.append({"label": c.strip(), "description": ""})
            elif isinstance(c, dict) and c.get("label"):
                valid.append({"label": c["label"].strip(), "description": c.get("description","").strip()})
        _config["risk_categories"] = valid
    else:
        return _err("action must be: add, remove, set")
    return _ok({"risk_categories": _config["risk_categories"]}, "Risk categories updated")


# ─────────────────────────────────────────────────────────────────────────────
# Funding Explorer  (enriched objects)
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/funding", methods=["GET"])
def get_funding():
    return _ok({"funding_sources": _config["funding_sources"]})

@business_bp.route("/funding", methods=["POST"])
def update_funding():
    body   = request.get_json(force=True) or {}
    action = body.get("action","set")
    def _norm(f):
        return {
            "name":         str(f.get("name","")).strip(),
            "type":         str(f.get("type","")).strip(),
            "amount":       str(f.get("amount","")).strip(),
            "description":  str(f.get("description","")).strip(),
            "how_to_apply": str(f.get("how_to_apply","")).strip(),
            "eligibility":  str(f.get("eligibility","")).strip(),
            "url":          str(f.get("url","")).strip(),
        }
    if action == "add":
        src = body.get("source",{})
        if not (src.get("name") and src.get("type") and src.get("amount")):
            return _err("source needs name, type, amount")
        _config["funding_sources"].append(_norm(src))
    elif action == "remove":
        name = body.get("name","").strip()
        if name: _config["funding_sources"] = [s for s in _config["funding_sources"] if s["name"] != name]
        elif _config["funding_sources"]: _config["funding_sources"].pop()
    elif action == "set":
        sources = body.get("sources")
        if not isinstance(sources, list): return _err("sources must be list")
        _config["funding_sources"] = [_norm(s) for s in sources if isinstance(s,dict) and s.get("name") and s.get("type") and s.get("amount")]
    else:
        return _err("action must be: add, remove, set")
    return _ok({"funding_sources": _config["funding_sources"]}, "Funding sources updated")


# ─────────────────────────────────────────────────────────────────────────────
# Pitch Practice
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/pitch", methods=["GET"])
def get_pitch():
    return _ok({"pitch": _config["pitch"]})

@business_bp.route("/pitch", methods=["POST"])
def update_pitch():
    body = request.get_json(force=True) or {}
    if "duration" in body:
        try: _config["pitch"]["duration"] = max(10, int(body["duration"]))
        except: return _err("duration must be integer >= 10")
    if "feedback_enabled" in body:
        _config["pitch"]["feedback_enabled"] = bool(body["feedback_enabled"])
    tip_action = body.get("tip_action")
    if tip_action == "add":
        tip = body.get("tip","").strip()
        if not tip: return _err("tip required")
        _config["pitch"]["tips"].append(tip)
    elif tip_action == "remove":
        tip = body.get("tip","").strip()
        if tip: _config["pitch"]["tips"] = [t for t in _config["pitch"]["tips"] if t != tip]
        elif _config["pitch"]["tips"]: _config["pitch"]["tips"].pop()
    elif tip_action == "set":
        tips = body.get("tips")
        if not isinstance(tips, list): return _err("tips must be list")
        _config["pitch"]["tips"] = [str(t).strip() for t in tips if str(t).strip()]
    return _ok({"pitch": _config["pitch"]}, "Pitch config updated")


# ─────────────────────────────────────────────────────────────────────────────
# AI Pitch Feedback
# ─────────────────────────────────────────────────────────────────────────────

PITCH_FEEDBACK_SYSTEM = """You are a startup pitch coach. Evaluate the elevator pitch and return ONLY a JSON object (no markdown):
{
  "scores": { "clarity": <1-10>, "confidence": <1-10>, "structure": <1-10>, "persuasiveness": <1-10> },
  "strengths":    ["strength 1", "strength 2"],
  "improvements": ["improvement 1", "improvement 2"],
  "suggestion":   "One specific actionable suggestion."
}"""

@business_bp.route("/pitch/feedback", methods=["POST"])
def pitch_feedback():
    body       = request.get_json(force=True) or {}
    pitch_text = body.get("pitch_text","").strip()
    idea       = body.get("idea", _config.get("idea","")).strip()
    if not pitch_text:        return _err("pitch_text required")
    if len(pitch_text) < 20:  return _err("Pitch too short to evaluate")
    context = f"Business idea: {idea}\n\nPitch:\n{pitch_text}" if idea else pitch_text
    try:
        raw = _chat([{"role":"system","content":PITCH_FEEDBACK_SYSTEM},{"role":"user","content":context}], temperature=0.5, max_tokens=600)
        if not raw:
            fallback = {
                "scores": { "clarity": 6, "confidence": 6, "structure": 5, "persuasiveness": 5 },
                "strengths":    ["Clear intent and problem statement"],
                "improvements": ["Add a specific customer segment and outcome metric"],
                "suggestion":   "Mention one concrete result you aim to deliver in the first 3 months.",
            }
            return _ok({"feedback": fallback}, "AI unavailable, using default feedback")
        feedback = _extract_json(raw)
        return _ok({"feedback": feedback}, "Pitch evaluated")
    except Exception as e:
        fallback = {
            "scores": { "clarity": 5, "confidence": 5, "structure": 5, "persuasiveness": 5 },
            "strengths":    ["You communicated the core idea"],
            "improvements": ["Add a clear value proposition and target audience"],
            "suggestion":   "State who your customer is and why your solution is better.",
        }
        return _ok({"feedback": fallback}, "AI error, using default feedback")


# ─────────────────────────────────────────────────────────────────────────────
# AI Mentor
# ─────────────────────────────────────────────────────────────────────────────

MENTOR_SYSTEM = """You are an expert startup mentor for Indian small businesses.
Be clear, practical, beginner-friendly, concise (3-6 sentences or short bullet list).
Reference Indian schemes, platforms, or examples when relevant. Always be encouraging.
If the user's business idea is provided, tailor every answer specifically to it."""

@business_bp.route("/mentor/prompts", methods=["GET"])
def get_mentor_prompts():
    return _ok({"mentor_prompts": _config["mentor_prompts"]})

@business_bp.route("/mentor/prompts", methods=["POST"])
def update_mentor_prompts():
    body = request.get_json(force=True) or {}
    action = body.get("action","set")
    if action == "add":
        p = body.get("prompt","").strip()
        if not p: return _err("prompt required")
        _config["mentor_prompts"].append(p)
    elif action == "remove":
        p = body.get("prompt","").strip()
        if p: _config["mentor_prompts"] = [x for x in _config["mentor_prompts"] if x != p]
        elif _config["mentor_prompts"]: _config["mentor_prompts"].pop()
    elif action == "set":
        prompts = body.get("prompts")
        if not isinstance(prompts, list): return _err("prompts must be list")
        _config["mentor_prompts"] = [str(p).strip() for p in prompts if str(p).strip()]
    else:
        return _err("action must be: add, remove, set")
    return _ok({"mentor_prompts": _config["mentor_prompts"]}, "Mentor prompts updated")

@business_bp.route("/mentor/ask", methods=["POST"])
def mentor_ask():
    body     = request.get_json(force=True) or {}
    question = body.get("question","").strip()
    idea     = body.get("idea", _config.get("idea","")).strip()
    if not question: return _err("question required")
    system = MENTOR_SYSTEM + (f"\n\nUser's business idea: {idea}" if idea else "")
    try:
        answer = _chat([{"role":"system","content":system},{"role":"user","content":question}], temperature=0.7, max_tokens=512)
        if not answer:
            fallback = "Start by talking to 5–10 potential customers, confirm the problem, then test a small pilot before investing heavily."
            return _ok({"answer": fallback}, "AI unavailable, using default advice")
        return _ok({"answer": answer}, "Mentor response received")
    except Exception as e:
        fallback = "Focus on validating demand: identify a clear customer, test a simple MVP, and iterate based on feedback."
        return _ok({"answer": fallback}, "AI error, using default advice")


# ─────────────────────────────────────────────────────────────────────────────
# Growth Roadmap
# ─────────────────────────────────────────────────────────────────────────────

@business_bp.route("/roadmap", methods=["GET"])
def get_roadmap():
    return _ok({"roadmap": _config["roadmap"]})

@business_bp.route("/roadmap", methods=["POST"])
def update_roadmap():
    body   = request.get_json(force=True) or {}
    action = body.get("action","set")
    if action == "add":
        step = body.get("step","").strip()
        if not step: return _err("step required")
        _config["roadmap"].append(step)
    elif action == "remove":
        step = body.get("step","").strip()
        if step: _config["roadmap"] = [s for s in _config["roadmap"] if s != step]
        elif _config["roadmap"]: _config["roadmap"].pop()
    elif action == "set":
        steps = body.get("steps")
        if not isinstance(steps, list): return _err("steps must be list")
        _config["roadmap"] = [str(s).strip() for s in steps if str(s).strip()]
    else:
        return _err("action must be: add, remove, set")
    return _ok({"roadmap": _config["roadmap"]}, "Roadmap updated")
