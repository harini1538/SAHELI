"""
login.py — Flask Blueprint: /api/auth/login | /api/auth/logout | /api/auth/me
------------------------------------------------------------------------------
Issues a JWT on successful login so the React frontend can store it
in localStorage and include it in Authorization headers.
"""

import os
import datetime
from typing import Optional

import jwt
from flask import Blueprint, request, jsonify, session
from models import db, User, bcrypt

login_bp = Blueprint("login_bp", __name__)

# ── JWT helpers ────────────────────────────────────────────────────────────────
_JWT_EXPIRY_HOURS = 24 * 7  # 7-day tokens


def _jwt_secret() -> str:
    return os.environ.get("SECRET_KEY", "saheli-dev-secret")


def _make_token(user: User) -> str:
    payload = {
        "sub":   user.id,
        "email": user.email,
        "role":  user.role,
        "name":  user.name,
        "iat":   datetime.datetime.utcnow(),
        "exp":   datetime.datetime.utcnow() + datetime.timedelta(hours=_JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def decode_token(token: str) -> Optional[dict]:
    """Decode and verify a JWT.  Returns payload dict or None on failure."""
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


# ── Session helper (kept for server-side session too) ─────────────────────────
def _set_session(user: User) -> None:
    session["user_id"]    = user.id
    session["user_email"] = user.email
    session["user_role"]  = user.role
    session["user_name"]  = user.name


def _current_user() -> Optional[User]:
    """Return authenticated User from session or Bearer token."""
    # 1. Try server-side session first
    uid = session.get("user_id")
    if uid:
        return db.session.get(User, uid)

    # 2. Fallback: JWT in Authorization header
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        payload = decode_token(auth_header[7:])
        if payload:
            return db.session.get(User, payload.get("sub"))

    return None


# ── POST /api/auth/login ───────────────────────────────────────────────────────
@login_bp.route("/api/auth/login", methods=["POST"])
def login():
    """
    Authenticate a user with email + password.

    Request JSON body:
        {
            "email":    "user@example.com",
            "password": "secret123",
            "role":     "user"           // optional
        }

    Response 200:
        {
            "message": "Logged in successfully.",
            "token":   "<JWT>",
            "user":    { id, name, email, role, ... }
        }
    """
    data = request.get_json(silent=True) or {}

    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    role     = (data.get("role") or "user").strip().lower()

    if not email or not password:
        return jsonify({"message": "Email and password are required."}), 400

    user: Optional[User] = User.query.filter_by(email=email).first()

    if not user or not user.password_hash:
        return jsonify({"message": "Invalid email or password."}), 401

    if not bcrypt.check_password_hash(user.password_hash, password):
        return jsonify({"message": "Invalid email or password."}), 401

    if role == "admin" and user.role != "admin":
        return jsonify({"message": "You do not have admin access."}), 403

    _set_session(user)
    token = _make_token(user)

    return jsonify({
        "message": "Logged in successfully.",
        "token":   token,
        "user":    user.to_dict(),
    }), 200


# ── POST /api/auth/logout ──────────────────────────────────────────────────────
@login_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200


# ── GET /api/auth/me ───────────────────────────────────────────────────────────
@login_bp.route("/api/auth/me", methods=["GET"])
def me():
    user = _current_user()
    if not user:
        return jsonify({"message": "Not authenticated."}), 401
    return jsonify({"user": user.to_dict()}), 200