"""
models.py — Shared SQLAlchemy models & extensions
--------------------------------------------------
Import db, bcrypt, and User from this module in all blueprints.
"""

import datetime
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt

db     = SQLAlchemy()
bcrypt = Bcrypt()


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    name          = db.Column(db.String(120), nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False, index=True)
    phone         = db.Column(db.String(30),  nullable=True)
    password_hash = db.Column(db.String(200), nullable=True)   # NULL for Google-only users
    role          = db.Column(db.String(20),  nullable=False, default="user")  # "user" | "admin"
    user_role     = db.Column(db.String(60),  nullable=True)   # "Student", "Professional" …
    interests     = db.Column(db.Text,        nullable=True)   # comma-separated strings
    google_id     = db.Column(db.String(120), unique=True, nullable=True)
    created_at    = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self) -> dict:
        return {
            "id":        self.id,
            "name":      self.name,
            "email":     self.email,
            "role":      self.role,
            "user_role": self.user_role,
            "interests": self.interests.split(",") if self.interests else [],
            "phone":     self.phone,
        }