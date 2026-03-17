"""
admin.py -- Admin analytics & stats endpoints
--------------------------------------------
Mounts at /api/admin/*
"""

from __future__ import annotations

import datetime as _dt
from typing import Optional

from flask import Blueprint, jsonify, request, session

from models import db, User
from login import decode_token
from community import CommunityPost, CommunityComment, CommunityLiveRoom
from sim import _load_dataset, _analytics_store, _template_store, _simulation_store


admin_bp = Blueprint("admin", __name__, url_prefix="/api/admin")


def _current_user() -> Optional[User]:
    uid = session.get("user_id")
    if uid:
        return db.session.get(User, uid)

    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = decode_token(auth[7:])
        if payload:
            return db.session.get(User, payload.get("sub"))
    return None


def _require_admin() -> Optional[User]:
    user = _current_user()
    if not user or user.role != "admin":
        return None
    return user


@admin_bp.route("/stats", methods=["GET"])
def admin_stats():
    user = _require_admin()
    if not user:
        return jsonify({"error": "admin only"}), 403

    # Active window in days (defaults to 30, clamped to [1, 365])
    try:
        window_days = int(request.args.get("active_days", 30))
    except Exception:
        window_days = 30
    window_days = max(1, min(365, window_days))
    cutoff = _dt.datetime.utcnow() - _dt.timedelta(days=window_days)

    total_users = User.query.count()
    active_learners = (
        User.query
        .filter(User.role == "user", User.created_at >= cutoff)
        .count()
    )

    community_posts = CommunityPost.query.count()
    community_comments = CommunityComment.query.count()
    community_talks = community_posts + community_comments
    community_posts_active = CommunityPost.query.filter_by(resolved=False).count()

    live_rooms_active = CommunityLiveRoom.query.filter_by(status="active").count()

    practice_completions = sum(
        1 for r in _analytics_store if r.get("event") == "simulation_complete"
    )

    dataset_scenarios = len(_load_dataset())
    templates_stored = len(_template_store)
    simulations_generated = len(_simulation_store)
    total_scenarios = dataset_scenarios + templates_stored

    return jsonify({
        "stats": {
            "total_users": total_users,
            "active_learners": active_learners,
            "active_learners_window_days": window_days,
            "community_posts": community_posts,
            "community_comments": community_comments,
            "community_talks": community_talks,
            "active_community_posts": community_posts_active,
            "live_rooms_active": live_rooms_active,
            "practice_simulations_completed": practice_completions,
            "total_scenarios": total_scenarios,
            "dataset_scenarios": dataset_scenarios,
            "templates_stored": templates_stored,
            "simulations_generated": simulations_generated,
            "updated_at": _dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z",
        }
    }), 200
