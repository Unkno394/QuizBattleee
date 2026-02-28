from __future__ import annotations

import base64
import hashlib
import hmac
import os
import random
import re
import secrets
from typing import Any

from fastapi import HTTPException, Request

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
PBKDF2_ITERATIONS = int(os.getenv("PASSWORD_HASH_ITERATIONS", "200000"))
CODE_LENGTH = int(os.getenv("CODE_LENGTH", "6"))


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def validate_email(email: str) -> bool:
    return bool(EMAIL_RE.match(email))


def validate_password_policy(password: str) -> str | None:
    if len(password) < 8:
        return "Пароль должен содержать минимум 8 символов"
    if re.search(r"[A-Za-z]", password) is None:
        return "Пароль должен содержать хотя бы одну английскую букву"
    return None


def normalize_code(code: str) -> str:
    return (code or "").strip()


def b64_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def b64_decode(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${b64_encode(salt)}${b64_encode(digest)}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = encoded_hash.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = b64_decode(salt_raw)
        expected_digest = b64_decode(digest_raw)
    except Exception:
        return False

    actual_digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual_digest, expected_digest)


def generate_code(length: int = CODE_LENGTH) -> str:
    return "".join(random.choice("0123456789") for _ in range(length))


def extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Требуется авторизация")
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail="Некорректный токен")
    token = authorization[len(prefix) :].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Некорректный токен")
    return token


def extract_client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    forwarded_for = (request.headers.get("x-forwarded-for") or "").strip()
    if forwarded_for:
        first = forwarded_for.split(",")[0].strip()
        if first:
            return first[:128]
    if request.client and request.client.host:
        return str(request.client.host)[:128]
    return None


def serialize_user(row: Any) -> dict[str, object]:
    return {
        "id": int(row["id"]),
        "email": row["email"],
        "display_name": row["display_name"],
        "avatar_url": row["avatar_url"],
        "preferred_mascot": row.get("preferred_mascot"),
        "coins": int(row.get("coins", 0) or 0),
        "profile_frame": row.get("profile_frame"),
        "equipped_cat_skin": row.get("equipped_cat_skin"),
        "equipped_dog_skin": row.get("equipped_dog_skin"),
        "equipped_victory_front_effect": row.get("equipped_victory_front_effect"),
        "equipped_victory_back_effect": row.get("equipped_victory_back_effect"),
        "is_email_verified": bool(row["is_email_verified"]),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "last_login_at": row["last_login_at"].isoformat() if row["last_login_at"] else None,
    }
