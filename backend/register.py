"""
register.py — Flask Blueprint
/api/auth/register | /api/auth/google | /api/auth/google/callback

Google callback now always redirects to:
  {FRONTEND_URL}/auth/callback?auth=google&name=...&email=...&role=...&token=...

The React <AuthCallback> page at /auth/callback reads these params,
writes them to localStorage, and navigates the user to /dashboard.
"""

import os
import urllib.parse
from typing import Optional

from flask import Blueprint, request, jsonify, session, redirect
from models import db, User, bcrypt

register_bp = Blueprint("register_bp", __name__)

_google = None


def init_google(google_client) -> None:
    global _google
    _google = google_client


def _frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:5173")


def _set_session(user: User) -> None:
    session["user_id"]    = user.id
    session["user_email"] = user.email
    session["user_role"]  = user.role
    session["user_name"]  = user.name


def _make_token(user: User) -> str:
    from login import _make_token as _mt
    return _mt(user)


# ── POST /api/auth/register ────────────────────────────────────────────────────
@register_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    name      = (data.get("name") or "").strip()
    email     = (data.get("email") or "").strip().lower()
    password  = data.get("password") or ""
    phone     = (data.get("phone") or "").strip()
    role      = (data.get("role") or "user").strip().lower()
    user_role = (data.get("user_role") or "").strip()
    interests = data.get("interests") or []

    if not name:
        return jsonify({"message": "Full name is required."}), 400
    if not email:
        return jsonify({"message": "Email is required."}), 400
    if not password or len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400
    if not isinstance(interests, list):
        interests = []

    if User.query.filter_by(email=email).first():
        return jsonify({"message": "An account with this email already exists."}), 409

    if role not in ("user", "admin"):
        role = "user"

    hashed = bcrypt.generate_password_hash(password).decode("utf-8")
    user = User(
        name          = name,
        email         = email,
        phone         = phone or None,
        password_hash = hashed,
        role          = role,
        user_role     = user_role or None,
        interests     = ",".join(str(i) for i in interests) if interests else None,
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "Account created successfully. Please sign in.",
        "user":    user.to_dict(),
    }), 201


# ── GET /api/auth/google ───────────────────────────────────────────────────────
@register_bp.route("/api/auth/google")
def google_login():
    if _google is None:
        return jsonify({"message": "Google OAuth is not configured."}), 503

    role = (request.args.get("role") or "user").strip().lower()
    if role not in ("user", "admin"):
        role = "user"
    # Store the intended destination so callback can pass it along
    session["oauth_role"]        = role
    # Always use the fixed callback page — ignore the 'redirect' param here
    session["oauth_destination"] = request.args.get("redirect", "/dashboard")

    callback_url = os.environ.get(
        "GOOGLE_CALLBACK_URL",
        "http://localhost:5000/api/auth/google/callback",
    )
    return _google.authorize_redirect(callback_url)


# ── GET /api/auth/google/callback ─────────────────────────────────────────────
@register_bp.route("/api/auth/google/callback")
def google_callback():
    frontend = _frontend_url()
    # The React page that handles OAuth params — ALWAYS redirect here
    frontend_callback = f"{frontend}/auth/callback"

    if _google is None:
        return redirect(f"{frontend_callback}?error=google_not_configured")

    try:
        token    = _google.authorize_access_token()
        userinfo = token.get("userinfo") or _google.userinfo()
    except Exception as exc:
        detail = urllib.parse.quote(str(exc)[:200])
        return redirect(f"{frontend_callback}?error=google_failed&detail={detail}")

    google_id = userinfo.get("sub")
    email     = (userinfo.get("email") or "").lower().strip()
    name      = userinfo.get("name") or email.split("@")[0]

    requested_role = (session.pop("oauth_role", None) or "user").strip().lower()
    if requested_role not in ("user", "admin"):
        requested_role = "user"
    session.pop("oauth_destination", None)

    if not google_id or not email:
        return redirect(f"{frontend_callback}?error=google_no_email")

    # Find or create user
    user: Optional[User] = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User.query.filter_by(email=email).first()
        if user:
            user.google_id = google_id
        else:
            user = User(
                name      = name,
                email     = email,
                google_id = google_id,
                role      = requested_role,
            )
            db.session.add(user)
    if user and requested_role == "admin" and user.role != "admin":
        return redirect(f"{frontend_callback}?error=admin_access_denied")

    db.session.commit()
    _set_session(user)

    jwt_token = _make_token(user)
    params = urllib.parse.urlencode({
        "auth":  "google",
        "name":  user.name,
        "email": user.email,
        "role":  user.role,
        "token": jwt_token,
    })
    # Always land on /auth/callback on the frontend
    return redirect(f"{frontend_callback}?{params}")
