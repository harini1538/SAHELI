"""
app.py — Saheli Platform Flask Application
------------------------------------------
Dependencies:
    pip install flask flask-cors authlib python-dotenv PyJWT groq gtts
"""

import os
import secrets

from flask import Flask, jsonify
from flask_cors import CORS
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv

# Load .env FIRST — before any local module imports
load_dotenv()

from models import db, bcrypt
from login import login_bp
from register import register_bp, init_google
from scheme import schemes_bp
from sim import sim_bp              # Simulation Blueprint
from voice import voice_bp          # Voice Assistant Blueprint
from business import business_bp    # Business Growth Studio Blueprint
from community import community_bp, init_socketio  # ← Community Blueprint
from admin import admin_bp          # Admin analytics Blueprint


def create_app() -> Flask:
    app = Flask(__name__)

    # ── Config ────────────────────────────────────────────────────────────────
    app.secret_key                               = os.environ.get("SECRET_KEY", secrets.token_hex(32))
    app.config["SQLALCHEMY_DATABASE_URI"]        = os.environ.get("DATABASE_URL", "sqlite:///auth.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SESSION_COOKIE_SAMESITE"]        = "Lax"
    app.config["SESSION_COOKIE_HTTPONLY"]        = True

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:8080")

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    bcrypt.init_app(app)
    CORS(
        app,
        supports_credentials=True,
        origins=[frontend_url],
        resources={
            r"/api/*": {
                "origins":       [frontend_url],
                "methods":       ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
            }
        },
    )

    # ── OAuth ─────────────────────────────────────────────────────────────────
    oauth  = OAuth(app)
    google = oauth.register(
        name                = "google",
        client_id           = os.environ.get("GOOGLE_CLIENT_ID"),
        client_secret       = os.environ.get("GOOGLE_CLIENT_SECRET"),
        server_metadata_url = "https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs       = {"scope": "openid email profile"},
    )
    init_google(google)

    # ── Blueprints ────────────────────────────────────────────────────────────
    app.register_blueprint(login_bp)
    app.register_blueprint(register_bp)
    app.register_blueprint(schemes_bp)
    app.register_blueprint(sim_bp)          # mounts at /api/sim/*
    app.register_blueprint(voice_bp)        # mounts at /api/voice-assistant & /api/audio/*
    app.register_blueprint(business_bp)     # mounts at /api/business/*
    app.register_blueprint(community_bp)    # mounts at /api/community/*
    app.register_blueprint(admin_bp)        # mounts at /api/admin/*

    # ── Optional Socket.IO (real-time) ──
    socketio = None
    enable_socketio = os.environ.get("ENABLE_SOCKETIO")
    if enable_socketio is None or str(enable_socketio).lower() in ("1", "true", "yes", "on"):
        try:
            socketio = init_socketio(app)
        except Exception:
            socketio = None
    app.extensions["socketio"] = socketio

    # ── Create DB tables ──────────────────────────────────────────────────────
    with app.app_context():
        db.create_all()

    # ── Health check ──────────────────────────────────────────────────────────
    @app.route("/api/health")
    def health():
        return jsonify({
            "status":              "ok",
            "service":             "women-empowerment-auth",
            "schemes_loaded":      True,
            "voice_enabled":       True,
            "business_enabled":    True,
            "community_enabled":   True,
        }), 200

    # ── Error handlers ────────────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Endpoint not found."}), 404

    @app.errorhandler(405)
    def method_not_allowed(_e):
        return jsonify({"error": "Method not allowed."}), 405

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"error": "Internal server error."}), 500

    return app


app = create_app()

if __name__ == "__main__":
    sock = app.extensions.get("socketio")
    if sock:
        sock.run(app, debug=True, port=5000)
    else:
        app.run(debug=True, port=5000)
