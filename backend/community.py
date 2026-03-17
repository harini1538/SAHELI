"""
community.py - Community Support Platform Blueprint
---------------------------------------------------
Mounts at /api/community/*

Implements:
  - Discussion forum (posts, comments, reactions, moderation)
  - Live rooms (sessions, chat messages, AI summaries)
  - Community polls (create/vote/close, AI-generated polls)
  - AI mentor and feed summarization helpers

Notes:
  - Uses SQLAlchemy models for persistence (SQLite/Postgres).
  - Admin-only actions are enforced when a logged-in admin is present.
  - For demo use, unauthenticated users can still perform user actions.
"""

from __future__ import annotations

import datetime as _dt
import json
import os
import uuid
from typing import Optional

from flask import Blueprint, request, jsonify, session

from models import db, User
from login import decode_token

try:
    from groq import Groq
except Exception:  # pragma: no cover - optional dependency
    Groq = None  # type: ignore

try:
    from flask_socketio import SocketIO, emit, join_room, leave_room
except Exception:  # pragma: no cover - optional dependency
    SocketIO = None  # type: ignore
    emit = join_room = leave_room = None  # type: ignore


community_bp = Blueprint("community", __name__, url_prefix="/api/community")
_socketio: Optional["SocketIO"] = None
_room_participants: dict[str, dict[str, dict]] = {}
_socket_rooms: dict[str, str] = {}


def init_socketio(app):
    """
    Optional Socket.IO init. Call from app.py when ENABLE_SOCKETIO=1.
    Returns the SocketIO instance or None if flask_socketio isn't installed.
    """
    global _socketio
    if SocketIO is None:
        return None
    # Use polling-only by default to avoid websocket 500s on the dev server.
    # This still supports real-time chat and signaling in development.
    kwargs = {
        "cors_allowed_origins": "*",
        "transports": ["polling"],
        "allow_upgrades": False,
        "async_mode": "threading",
    }
    redis_url = os.environ.get("REDIS_URL")
    if redis_url:
        kwargs["message_queue"] = redis_url
    _socketio = SocketIO(app, **kwargs)
    _register_socket_handlers()
    return _socketio


def _broadcast(event: str, payload: dict, room: Optional[str] = None):
    if _socketio is None:
        return
    if room:
        _socketio.emit(event, payload, to=room)
    else:
        _socketio.emit(event, payload)


def _register_socket_handlers():
    if _socketio is None:
        return

    @_socketio.on("connect")
    def _on_connect():
        emit("connected", {"ok": True})

    @_socketio.on("join_room")
    def _on_join(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        user = str((data or {}).get("user", "Guest")).strip() or "Guest"
        if not room_id:
            return
        join_room(room_id)
        emit("user_joined", {"room_id": room_id, "user": user}, to=room_id)

    @_socketio.on("leave_room")
    def _on_leave(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        user = str((data or {}).get("user", "Guest")).strip() or "Guest"
        if not room_id:
            return
        leave_room(room_id)
        emit("user_left", {"room_id": room_id, "user": user}, to=room_id)

    @_socketio.on("chat_message")
    def _on_chat(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        if not room_id:
            return
        emit("chat_message", data, to=room_id)

    @_socketio.on("reaction_event")
    def _on_reaction(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        emit("reaction_event", data, to=room_id or None)

    @_socketio.on("raise_hand")
    def _on_raise(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        emit("raise_hand", data, to=room_id or None)

    @_socketio.on("mute_user")
    def _on_mute(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        emit("mute_user", data, to=room_id or None)

    @_socketio.on("end_room")
    def _on_end(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        emit("end_room", data, to=room_id or None)

    def _emit_participants(room_id: str):
        participants = list(_room_participants.get(room_id, {}).values())
        emit("room_participants", {"room_id": room_id, "participants": participants}, to=room_id)

    @_socketio.on("live_room_join")
    def _on_live_room_join(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        name = str((data or {}).get("user", "Guest")).strip() or "Guest"
        video = bool((data or {}).get("video", False))
        if not room_id:
            return
        join_room(room_id)
        sid = request.sid
        _socket_rooms[sid] = room_id
        room = _room_participants.setdefault(room_id, {})
        room[sid] = {"id": sid, "name": name, "video": video}
        _emit_participants(room_id)

    @_socketio.on("live_room_leave")
    def _on_live_room_leave(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        if not room_id:
            return
        leave_room(room_id)
        sid = request.sid
        _socket_rooms.pop(sid, None)
        room = _room_participants.get(room_id, {})
        if sid in room:
            room.pop(sid, None)
        if not room:
            _room_participants.pop(room_id, None)
        _emit_participants(room_id)

    @_socketio.on("live_room_video")
    def _on_live_room_video(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        if not room_id:
            return
        sid = request.sid
        room = _room_participants.get(room_id, {})
        if sid in room:
            room[sid]["video"] = bool((data or {}).get("video", False))
        _emit_participants(room_id)

    @_socketio.on("webrtc_offer")
    def _on_webrtc_offer(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        target_id = str((data or {}).get("target_id", "")).strip()
        if not room_id or not target_id:
            return
        sid = request.sid
        room = _room_participants.get(room_id, {})
        name = room.get(sid, {}).get("name", "")
        emit("webrtc_offer", {"room_id": room_id, "from": sid, "from_name": name, "offer": data.get("offer")}, to=target_id)

    @_socketio.on("webrtc_answer")
    def _on_webrtc_answer(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        target_id = str((data or {}).get("target_id", "")).strip()
        if not room_id or not target_id:
            return
        sid = request.sid
        emit("webrtc_answer", {"room_id": room_id, "from": sid, "answer": data.get("answer")}, to=target_id)

    @_socketio.on("webrtc_ice")
    def _on_webrtc_ice(data):
        room_id = str((data or {}).get("room_id", "")).strip()
        target_id = str((data or {}).get("target_id", "")).strip()
        if not room_id or not target_id:
            return
        sid = request.sid
        emit("webrtc_ice", {"room_id": room_id, "from": sid, "candidate": data.get("candidate")}, to=target_id)

    @_socketio.on("disconnect")
    def _on_disconnect():
        sid = request.sid
        room_id = _socket_rooms.pop(sid, None)
        if not room_id:
            return
        room = _room_participants.get(room_id, {})
        if sid in room:
            room.pop(sid, None)
        if not room:
            _room_participants.pop(room_id, None)
        _emit_participants(room_id)


# ------------------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------------------
def _now() -> _dt.datetime:
    return _dt.datetime.utcnow()


def _iso(dt: Optional[_dt.datetime]) -> str:
    if not dt:
        return ""
    return dt.replace(microsecond=0).isoformat() + "Z"


def _time(dt: Optional[_dt.datetime]) -> str:
    if not dt:
        return ""
    return dt.strftime("%H:%M")


def _gen_id() -> str:
    return uuid.uuid4().hex


def _current_user() -> Optional[User]:
    # Try session
    uid = session.get("user_id")
    if uid:
        return db.session.get(User, uid)

    # Try Bearer token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        payload = decode_token(auth[7:])
        if payload:
            return db.session.get(User, payload.get("sub"))

    return None


def _actor_name(body_author: Optional[str] = None) -> tuple[Optional[User], str, str]:
    user = _current_user()
    if user:
        return user, user.name, user.role
    if body_author:
        return None, str(body_author).strip() or "Guest", "user"
    return None, "Guest", "user"


def _require_admin() -> Optional[User]:
    user = _current_user()
    if not user or user.role != "admin":
        return None
    return user


def _json():
    return request.get_json(silent=True) or {}


def _ai_client() -> Optional[Groq]:
    key = os.environ.get("GROQ_API_KEY")
    if not key or Groq is None:
        return None
    return Groq(api_key=key)


def _ai_chat(messages, temperature=0.6, max_tokens=512) -> Optional[str]:
    client = _ai_client()
    if not client:
        return None
    try:
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return None


# ------------------------------------------------------------------------------
# Database Models
# ------------------------------------------------------------------------------
class CommunityPost(db.Model):
    __tablename__ = "community_posts"

    id          = db.Column(db.String(40), primary_key=True)
    author_id   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    author_name = db.Column(db.String(120), nullable=False)
    text        = db.Column(db.Text, nullable=False)
    category    = db.Column(db.String(60), nullable=False, default="General")
    image_url   = db.Column(db.Text, nullable=True)
    anonymous   = db.Column(db.Boolean, default=False)
    created_at  = db.Column(db.DateTime, default=_now)

    heart       = db.Column(db.Integer, default=0)
    handshake   = db.Column(db.Integer, default=0)
    star        = db.Column(db.Integer, default=0)

    pinned      = db.Column(db.Boolean, default=False)
    highlighted = db.Column(db.Boolean, default=False)
    resolved    = db.Column(db.Boolean, default=False)
    reviewed    = db.Column(db.Boolean, default=False)

    comments = db.relationship(
        "CommunityComment",
        backref="post",
        cascade="all, delete-orphan",
        order_by="CommunityComment.created_at.asc()",
    )

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "author":     "Anonymous" if self.anonymous else self.author_name,
            "text":       self.text,
            "image":      self.image_url,
            "reactions":  {
                "heart":     int(self.heart or 0),
                "handshake": int(self.handshake or 0),
                "star":      int(self.star or 0),
            },
            "category":   self.category,
            "anonymous":  bool(self.anonymous),
            "comments":   [c.to_dict() for c in self.comments],
            "createdAt":  _iso(self.created_at),
            "pinned":     bool(self.pinned),
            "highlighted": bool(self.highlighted),
            "resolved":   bool(self.resolved),
            "reviewed":   bool(self.reviewed),
        }


class CommunityComment(db.Model):
    __tablename__ = "community_comments"

    id          = db.Column(db.String(40), primary_key=True)
    post_id     = db.Column(db.String(40), db.ForeignKey("community_posts.id"), nullable=False)
    author_id   = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    author_name = db.Column(db.String(120), nullable=False)
    text        = db.Column(db.Text, nullable=False)
    created_at  = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "id":        self.id,
            "author":    self.author_name,
            "text":      self.text,
            "createdAt": _iso(self.created_at),
        }


class CommunityPoll(db.Model):
    __tablename__ = "community_polls"

    id          = db.Column(db.String(40), primary_key=True)
    question    = db.Column(db.Text, nullable=False)
    description = db.Column(db.Text, nullable=True)
    created_by  = db.Column(db.String(120), nullable=True)
    created_at  = db.Column(db.DateTime, default=_now)
    room_id     = db.Column(db.String(40), nullable=True)
    closed      = db.Column(db.Boolean, default=False)

    options = db.relationship(
        "CommunityPollOption",
        backref="poll",
        cascade="all, delete-orphan",
        order_by="CommunityPollOption.created_at.asc()",
    )

    def to_dict(self) -> dict:
        opts = [o.to_dict() for o in self.options]
        total_votes = sum(o.get("votes", 0) for o in opts)
        return {
            "id":         self.id,
            "question":   self.question,
            "description": self.description or "",
            "options":    opts,
            "totalVotes": total_votes,
            "closed":     bool(self.closed),
        }


class CommunityPollOption(db.Model):
    __tablename__ = "community_poll_options"

    id         = db.Column(db.String(40), primary_key=True)
    poll_id    = db.Column(db.String(40), db.ForeignKey("community_polls.id"), nullable=False)
    text       = db.Column(db.Text, nullable=False)
    votes      = db.Column(db.Integer, default=0)
    safe       = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "id":    self.id,
            "text":  self.text,
            "votes": int(self.votes or 0),
            "safe":  bool(self.safe),
        }


class CommunityLiveRoom(db.Model):
    __tablename__ = "community_live_rooms"

    id              = db.Column(db.String(40), primary_key=True)
    title           = db.Column(db.String(160), nullable=False)
    topic           = db.Column(db.Text, nullable=True)
    moderator_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    moderator_name  = db.Column(db.String(120), nullable=False)
    created_at      = db.Column(db.DateTime, default=_now)
    started_at      = db.Column(db.DateTime, nullable=True)
    ended_at        = db.Column(db.DateTime, nullable=True)
    status          = db.Column(db.String(20), default="scheduled")  # scheduled | active | ended
    max_participants = db.Column(db.Integer, default=200)
    participants    = db.Column(db.Integer, default=0)

    messages = db.relationship(
        "CommunityLiveMessage",
        backref="room",
        cascade="all, delete-orphan",
        order_by="CommunityLiveMessage.created_at.asc()",
    )

    def to_dict(self) -> dict:
        return {
            "id":          self.id,
            "title":       self.title,
            "topic":       self.topic or "",
            "participants": int(self.participants or 0),
            "moderator":   self.moderator_name,
            "messages":    [m.to_dict() for m in self.messages],
            "isActive":    self.status == "active",
            "createdAt":   _iso(self.created_at),
        }


class CommunityLiveMessage(db.Model):
    __tablename__ = "community_live_messages"

    id         = db.Column(db.String(40), primary_key=True)
    room_id    = db.Column(db.String(40), db.ForeignKey("community_live_rooms.id"), nullable=False)
    user_id    = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    author_name = db.Column(db.String(120), nullable=False)
    message    = db.Column(db.Text, nullable=False)
    msg_type   = db.Column(db.String(20), default="chat")  # chat | system | ai
    created_at = db.Column(db.DateTime, default=_now)

    def to_dict(self) -> dict:
        return {
            "id":     self.id,
            "author": self.author_name,
            "text":   self.message,
            "time":   _time(self.created_at),
            "isSystem": self.msg_type == "system",
        }


# ------------------------------------------------------------------------------
# AI Helpers
# ------------------------------------------------------------------------------
def _heuristic_moderation(text: str) -> dict:
    t = (text or "").lower()
    scam = any(k in t for k in ["otp", "pin", "password", "bank", "upi", "loan app", "crypto", "bitcoin", "investment", "send money"])
    abuse = any(k in t for k in ["abuse", "idiot", "stupid", "hate", "kill", "harass"])
    if scam:
        return {
            "safe": False,
            "flag": "Potential Scam",
            "suggestion": "Avoid sharing OTPs, PINs, or banking details. Official services never ask for them.",
        }
    if abuse:
        return {
            "safe": False,
            "flag": "Abusive Language",
            "suggestion": "Please keep the conversation respectful and supportive.",
        }
    return {
        "safe": True,
        "flag": "Looks OK",
        "suggestion": "No obvious safety issues detected.",
    }


def _ai_moderate(text: str) -> dict:
    prompt = {
        "role": "system",
        "content": (
            "You are a safety moderator. Return ONLY JSON: "
            '{"safe": true|false, "flag": "short label", "suggestion": "short guidance"}'
        ),
    }
    user = {"role": "user", "content": text[:1500]}
    out = _ai_chat([prompt, user], temperature=0.2, max_tokens=200)
    if out:
        try:
            data = json.loads(out.strip().strip("`"))
            if isinstance(data, dict) and "safe" in data:
                return {
                    "safe": bool(data.get("safe")),
                    "flag": str(data.get("flag", "Review")).strip() or "Review",
                    "suggestion": str(data.get("suggestion", "")).strip() or "Please review this content.",
                }
        except Exception:
            pass
    return _heuristic_moderation(text)


def _ai_generate_poll(topic: str) -> dict:
    prompt = {
        "role": "system",
        "content": (
            "Create a community safety poll. Return ONLY JSON with keys: "
            '{"question": "...", "description": "...", "options": ["a","b","c"], "safe_index": 0}'
        ),
    }
    user = {"role": "user", "content": f"Topic: {topic}"}
    out = _ai_chat([prompt, user], temperature=0.6, max_tokens=300)
    if out:
        try:
            data = json.loads(out.strip().strip("`"))
            if isinstance(data, dict) and isinstance(data.get("options"), list):
                opts = [str(o).strip() for o in data["options"] if str(o).strip()]
                if len(opts) >= 2:
                    return {
                        "question": str(data.get("question", "")).strip() or f"What is the safest action about {topic}-",
                        "description": str(data.get("description", "")).strip() or "Community scenario poll",
                        "options": opts[:4],
                        "safe_index": int(data.get("safe_index", 0)) if str(data.get("safe_index", "")).isdigit() else 0,
                    }
        except Exception:
            pass

    # Fallback
    safe = f"Verify with official sources before sharing information about {topic}."
    options = [
        safe,
        f"Forward the message about {topic} to friends immediately.",
        f"Ignore all messages about {topic} without checking.",
    ]
    return {
        "question": f"How should you respond to {topic} related messages-",
        "description": "Safety-first community poll",
        "options": options,
        "safe_index": 0,
    }


def _ai_mentor_reply(message: str, context: str = "") -> str:
    system = (
        "You are a supportive mentor for women's safety, rights, and entrepreneurship in India. "
        "Be practical, concise, and encouraging."
    )
    if context:
        system += f" Context: {context}"
    out = _ai_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": message[:1500]}],
        temperature=0.7,
        max_tokens=220,
    )
    if out:
        return out
    return "Thanks for asking. A safe next step is to verify details with official sources and avoid sharing sensitive information."


def _ai_summarise_feed(posts: list[CommunityPost], category: Optional[str] = None) -> dict:
    texts = [p.text for p in posts[:8] if p.text]
    digest = "Highlights:\n" + "\n".join(f"- {t[:120]}..." for t in texts[:4]) if texts else "No recent discussions yet."
    hot_topics = [p.category for p in posts[:6] if p.category]
    hot_topics = list(dict.fromkeys(hot_topics))[:4]

    out = _ai_chat(
        [
            {"role": "system", "content": "Summarize the feed into a short digest and list hot topics. Return JSON: {digest: '', hotTopics: []}"},
            {"role": "user", "content": "\n".join(texts)[:2000]},
        ],
        temperature=0.5,
        max_tokens=200,
    )
    if out:
        try:
            data = json.loads(out.strip().strip("`"))
            if isinstance(data, dict) and "digest" in data:
                return {
                    "digest": str(data.get("digest", "")).strip() or digest,
                    "hotTopics": data.get("hotTopics", hot_topics) or hot_topics,
                }
        except Exception:
            pass

    return {"digest": digest, "hotTopics": hot_topics}


def _ai_room_summary(room: CommunityLiveRoom) -> dict:
    texts = [m.message for m in room.messages[-20:]]
    basic = {
        "summary": "Session covered key questions and shared guidance.",
        "keyPoints": ["Be cautious with personal data.", "Verify with official sources."],
        "actionItems": ["Share verified resources with members.", "Follow up on unanswered questions."],
    }
    out = _ai_chat(
        [
            {"role": "system", "content": "Summarize the live room into JSON: {summary:'', keyPoints:[], actionItems:[]}"},
            {"role": "user", "content": "\n".join(texts)[:2000]},
        ],
        temperature=0.5,
        max_tokens=240,
    )
    if out:
        try:
            data = json.loads(out.strip().strip("`"))
            if isinstance(data, dict) and "summary" in data:
                return {
                    "summary": str(data.get("summary", "")).strip() or basic["summary"],
                    "keyPoints": data.get("keyPoints", basic["keyPoints"]) or basic["keyPoints"],
                    "actionItems": data.get("actionItems", basic["actionItems"]) or basic["actionItems"],
                }
        except Exception:
            pass
    return basic


# ------------------------------------------------------------------------------
# Discussion Forum Endpoints
# ------------------------------------------------------------------------------
@community_bp.route("/posts", methods=["GET"])
def get_posts():
    posts = CommunityPost.query.order_by(CommunityPost.pinned.desc(), CommunityPost.created_at.desc()).all()
    return jsonify([p.to_dict() for p in posts]), 200


@community_bp.route("/posts", methods=["POST"])
def create_post():
    data = _json()
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    category = str(data.get("category", "")).strip() or "General"
    image = data.get("image") or data.get("image_url")
    anonymous = bool(data.get("anonymous", False))

    user, name, _role = _actor_name(data.get("author"))
    post = CommunityPost(
        id=_gen_id(),
        author_id=user.id if user else None,
        author_name=name,
        text=text,
        category=category,
        image_url=image,
        anonymous=anonymous,
    )
    db.session.add(post)
    db.session.commit()
    _broadcast("post_created", {"post": post.to_dict()})
    return jsonify(post.to_dict()), 201


@community_bp.route("/posts/<post_id>", methods=["PATCH"])
def update_post(post_id: str):
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404

    data = _json()
    admin_fields = {"pinned", "highlighted", "resolved", "reviewed"}
    if any(k in data for k in admin_fields):
        if not _require_admin():
            return jsonify({"error": "admin only"}), 403

    if "text" in data:
        post.text = str(data.get("text", "")).strip() or post.text
    if "category" in data:
        post.category = str(data.get("category", "")).strip() or post.category
    if "image" in data or "image_url" in data:
        post.image_url = data.get("image") or data.get("image_url")
    if "pinned" in data:
        post.pinned = bool(data.get("pinned"))
    if "highlighted" in data:
        post.highlighted = bool(data.get("highlighted"))
    if "resolved" in data:
        post.resolved = bool(data.get("resolved"))
    if "reviewed" in data:
        post.reviewed = bool(data.get("reviewed"))

    db.session.commit()
    _broadcast("post_updated", {"post": post.to_dict()})
    return jsonify(post.to_dict()), 200


@community_bp.route("/posts/<post_id>", methods=["DELETE"])
def delete_post(post_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404
    db.session.delete(post)
    db.session.commit()
    _broadcast("post_deleted", {"post_id": post_id})
    return jsonify({"status": "ok"}), 200


@community_bp.route("/posts/<post_id>/react", methods=["POST"])
def react_post(post_id: str):
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404

    data = _json()
    rtype = str(data.get("type", "")).strip().lower()
    if rtype not in {"heart", "handshake", "star"}:
        return jsonify({"error": "invalid reaction type"}), 400

    if rtype == "heart":
        post.heart += 1
    elif rtype == "handshake":
        post.handshake += 1
    else:
        post.star += 1
    db.session.commit()
    _broadcast("post_reaction", {"post_id": post_id, "reactions": post.to_dict()["reactions"]})
    return jsonify(post.to_dict()["reactions"]), 200


@community_bp.route("/posts/<post_id>/comments", methods=["POST"])
def add_comment(post_id: str):
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404

    data = _json()
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400

    user, name, _role = _actor_name(data.get("author"))
    comment = CommunityComment(
        id=_gen_id(),
        post_id=post.id,
        author_id=user.id if user else None,
        author_name=name,
        text=text,
    )
    db.session.add(comment)
    db.session.commit()
    _broadcast("post_comment", {"post_id": post_id, "comment": comment.to_dict()})
    return jsonify(comment.to_dict()), 201


@community_bp.route("/posts/<post_id>/comments", methods=["DELETE"])
def clear_comments(post_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404
    CommunityComment.query.filter_by(post_id=post.id).delete()
    db.session.commit()
    _broadcast("post_comments_cleared", {"post_id": post_id})
    return jsonify({"status": "ok"}), 200


@community_bp.route("/posts/<post_id>/ai-moderate", methods=["POST"])
def ai_moderate_post(post_id: str):
    post = CommunityPost.query.get(post_id)
    if not post:
        return jsonify({"error": "post not found"}), 404
    return jsonify(_ai_moderate(post.text)), 200


# ------------------------------------------------------------------------------
# Poll Endpoints
# ------------------------------------------------------------------------------
@community_bp.route("/polls", methods=["GET"])
def get_polls():
    polls = CommunityPoll.query.order_by(CommunityPoll.created_at.desc()).all()
    return jsonify([p.to_dict() for p in polls]), 200


@community_bp.route("/polls", methods=["POST"])
def create_poll():
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    data = _json()
    question = str(data.get("question", "")).strip()
    options = data.get("options", [])
    if not question or not isinstance(options, list) or len(options) < 2:
        return jsonify({"error": "question and at least 2 options are required"}), 400

    poll = CommunityPoll(
        id=_gen_id(),
        question=question,
        description=str(data.get("description", "")).strip() or "Community poll",
        created_by=_current_user().name if _current_user() else "Admin",
        closed=False,
    )
    db.session.add(poll)
    for i, opt in enumerate(options):
        text = str(opt).strip()
        if not text:
            continue
        db.session.add(CommunityPollOption(
            id=_gen_id(),
            poll_id=poll.id,
            text=text,
            votes=0,
            safe=False,
        ))
    db.session.commit()
    _broadcast("poll_created", {"poll": poll.to_dict()})
    return jsonify(poll.to_dict()), 201


@community_bp.route("/polls/<poll_id>", methods=["PATCH"])
def update_poll(poll_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    poll = CommunityPoll.query.get(poll_id)
    if not poll:
        return jsonify({"error": "poll not found"}), 404

    data = _json()
    if "question" in data:
        poll.question = str(data.get("question", "")).strip() or poll.question
    if "description" in data:
        poll.description = str(data.get("description", "")).strip() or poll.description
    if "closed" in data:
        poll.closed = bool(data.get("closed"))
    if "options" in data and isinstance(data["options"], list):
        CommunityPollOption.query.filter_by(poll_id=poll.id).delete()
        for opt in data["options"]:
            text = str(opt).strip()
            if text:
                db.session.add(CommunityPollOption(
                    id=_gen_id(),
                    poll_id=poll.id,
                    text=text,
                    votes=0,
                    safe=False,
                ))
    db.session.commit()
    _broadcast("poll_updated", {"poll": poll.to_dict()})
    return jsonify(poll.to_dict()), 200


@community_bp.route("/polls/<poll_id>", methods=["DELETE"])
def delete_poll(poll_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    poll = CommunityPoll.query.get(poll_id)
    if not poll:
        return jsonify({"error": "poll not found"}), 404
    db.session.delete(poll)
    db.session.commit()
    _broadcast("poll_deleted", {"poll_id": poll_id})
    return jsonify({"status": "ok"}), 200


@community_bp.route("/polls/<poll_id>/vote", methods=["POST"])
def vote_poll(poll_id: str):
    poll = CommunityPoll.query.get(poll_id)
    if not poll:
        return jsonify({"error": "poll not found"}), 404
    if poll.closed:
        return jsonify({"error": "poll is closed"}), 400
    data = _json()
    option_id = str(data.get("optionId", "")).strip()
    option = CommunityPollOption.query.filter_by(poll_id=poll.id, id=option_id).first()
    if not option:
        return jsonify({"error": "option not found"}), 404
    option.votes += 1
    db.session.commit()
    _broadcast("poll_voted", {"poll": poll.to_dict()})
    return jsonify(poll.to_dict()), 200


@community_bp.route("/polls/ai-generate", methods=["POST"])
def ai_generate_poll():
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    data = _json()
    topic = str(data.get("topic", "")).strip() or "online safety"
    gen = _ai_generate_poll(topic)
    poll = CommunityPoll(
        id=_gen_id(),
        question=gen["question"],
        description=gen.get("description", "Community poll"),
        created_by=_current_user().name if _current_user() else "Admin",
        closed=False,
    )
    db.session.add(poll)
    safe_index = max(0, min(int(gen.get("safe_index", 0)), len(gen["options"]) - 1))
    for i, opt in enumerate(gen["options"]):
        db.session.add(CommunityPollOption(
            id=_gen_id(),
            poll_id=poll.id,
            text=opt,
            votes=0,
            safe=i == safe_index,
        ))
    db.session.commit()
    _broadcast("poll_created", {"poll": poll.to_dict()})
    return jsonify(poll.to_dict()), 201


# ------------------------------------------------------------------------------
# Live Room Endpoints
# ------------------------------------------------------------------------------
@community_bp.route("/live-rooms", methods=["GET"])
def get_live_rooms():
    rooms = CommunityLiveRoom.query.order_by(CommunityLiveRoom.created_at.desc()).all()
    return jsonify([r.to_dict() for r in rooms]), 200


@community_bp.route("/live-rooms", methods=["POST"])
def create_live_room():
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    data = _json()
    title = str(data.get("title", "")).strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    topic = str(data.get("topic", "")).strip()
    moderator = str(data.get("moderator", "")).strip() or (_current_user().name if _current_user() else "Admin")

    room = CommunityLiveRoom(
        id=_gen_id(),
        title=title,
        topic=topic,
        moderator_id=_current_user().id if _current_user() else None,
        moderator_name=moderator,
        status="active",
        started_at=_now(),
        participants=0,
    )
    db.session.add(room)
    db.session.commit()
    _broadcast("room_created", {"room": room.to_dict()})
    return jsonify(room.to_dict()), 201


@community_bp.route("/live-rooms/<room_id>", methods=["PATCH"])
def update_live_room(room_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    room = CommunityLiveRoom.query.get(room_id)
    if not room:
        return jsonify({"error": "room not found"}), 404
    data = _json()
    if "title" in data:
        room.title = str(data.get("title", "")).strip() or room.title
    if "topic" in data:
        room.topic = str(data.get("topic", "")).strip()
    if "isActive" in data:
        if bool(data.get("isActive")):
            room.status = "active"
            room.started_at = room.started_at or _now()
        else:
            room.status = "ended"
            room.ended_at = _now()
    db.session.commit()
    _broadcast("room_updated", {"room": room.to_dict()})
    return jsonify(room.to_dict()), 200


@community_bp.route("/live-rooms/<room_id>/join", methods=["POST"])
def join_live_room(room_id: str):
    room = CommunityLiveRoom.query.get(room_id)
    if not room:
        return jsonify({"error": "room not found"}), 404
    if room.status != "active":
        return jsonify({"error": "room is not active"}), 400
    room.participants = int(room.participants or 0) + 1
    db.session.commit()
    _broadcast("user_joined", {"room_id": room_id})
    return jsonify({"status": "ok"}), 200


@community_bp.route("/live-rooms/<room_id>/end", methods=["POST"])
def end_live_room(room_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    room = CommunityLiveRoom.query.get(room_id)
    if not room:
        return jsonify({"error": "room not found"}), 404
    room.status = "ended"
    room.ended_at = _now()
    db.session.commit()
    _broadcast("end_room", {"room_id": room_id})
    return jsonify({"status": "ok"}), 200


@community_bp.route("/live-rooms/<room_id>/message", methods=["POST"])
def send_live_message(room_id: str):
    room = CommunityLiveRoom.query.get(room_id)
    if not room:
        return jsonify({"error": "room not found"}), 404
    data = _json()
    text = str(data.get("text", "")).strip()
    if not text:
        return jsonify({"error": "text is required"}), 400
    user, name, _role = _actor_name(data.get("author"))
    msg = CommunityLiveMessage(
        id=_gen_id(),
        room_id=room.id,
        user_id=user.id if user else None,
        author_name=name,
        message=text,
        msg_type="chat",
    )
    db.session.add(msg)
    db.session.commit()
    _broadcast("chat_message", {"room_id": room_id, "message": msg.to_dict()}, room=room_id)
    return jsonify(msg.to_dict()), 201


@community_bp.route("/live-rooms/<room_id>/messages/<message_id>", methods=["DELETE"])
def delete_live_message(room_id: str, message_id: str):
    if not _require_admin():
        return jsonify({"error": "admin only"}), 403
    msg = CommunityLiveMessage.query.filter_by(room_id=room_id, id=message_id).first()
    if not msg:
        return jsonify({"error": "message not found"}), 404
    db.session.delete(msg)
    db.session.commit()
    _broadcast("remove_message", {"room_id": room_id, "message_id": message_id}, room=room_id)
    return jsonify({"status": "ok"}), 200


@community_bp.route("/live-rooms/<room_id>/ai-summary", methods=["GET"])
def live_room_summary(room_id: str):
    room = CommunityLiveRoom.query.get(room_id)
    if not room:
        return jsonify({"error": "room not found"}), 404
    return jsonify(_ai_room_summary(room)), 200


# ------------------------------------------------------------------------------
# AI Mentor + Feed Summary
# ------------------------------------------------------------------------------
@community_bp.route("/ai-mentor", methods=["POST"])
def ai_mentor():
    data = _json()
    message = str(data.get("message", "")).strip()
    if not message:
        return jsonify({"error": "message is required"}), 400
    context = str(data.get("context", "")).strip()
    return jsonify({"reply": _ai_mentor_reply(message, context)}), 200


@community_bp.route("/ai-summarise-feed", methods=["POST"])
def ai_summarise_feed():
    data = _json()
    category = str(data.get("category", "")).strip() or None
    q = CommunityPost.query
    if category:
        q = q.filter_by(category=category)
    posts = q.order_by(CommunityPost.created_at.desc()).limit(20).all()
    return jsonify(_ai_summarise_feed(posts, category)), 200
