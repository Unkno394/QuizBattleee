from __future__ import annotations

import json
import os
import smtplib
import ssl
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib import error as urlerror
from urllib.request import Request as UrlRequest, urlopen

from fastapi import APIRouter, Header, HTTPException, Request
from dotenv import load_dotenv

from .auth_schemas import (
    ChangeEmailRequest,
    ChangePasswordRequest,
    EmailRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    ShopBuyRequest,
    ShopEquipRequest,
    UpdateProfileRequest,
    VerifyCodeRequest,
    VerifyResetRequest,
)
from .auth_utils import (
    extract_bearer_token as _extract_bearer_token,
    extract_client_ip as _extract_client_ip,
    generate_code as _generate_code,
    hash_password as _hash_password,
    normalize_code as _normalize_code,
    normalize_email as _normalize_email,
    serialize_user as _serialize_user,
    validate_email as _validate_email,
    validate_password_policy as _validate_password_policy,
    verify_password as _verify_password,
)
from .auth_repository import (
    buy_market_item as repo_buy_market_item,
    consume_email_code as repo_consume_email_code,
    delete_codes_for_email as repo_delete_codes_for_email,
    equip_mascot_skin as repo_equip_mascot_skin,
    equip_profile_frame as repo_equip_profile_frame,
    equip_victory_effect as repo_equip_victory_effect,
    ensure_owned_item_ids as repo_ensure_owned_item_ids,
    get_email_code as repo_get_email_code,
    get_owned_item_ids as repo_get_owned_item_ids,
    get_user_by_email as repo_get_user_by_email,
    get_user_by_id as repo_get_user_by_id,
    mark_email_verified as repo_mark_email_verified,
    touch_last_login as repo_touch_last_login,
    update_profile as repo_update_profile,
    update_user_email as repo_update_user_email,
    update_user_password as repo_update_user_password,
    upsert_email_code as repo_upsert_email_code,
    upsert_pending_user as repo_upsert_pending_user,
    utc_now as repo_utc_now,
)
from .market_catalog import (
    DEFAULT_EQUIPPED_VICTORY_BACK_EFFECT_ITEM_ID,
    DEFAULT_EQUIPPED_VICTORY_FRONT_EFFECT_ITEM_ID,
    DEFAULT_OWNED_MARKET_ITEM_IDS,
    MARKET_ITEMS,
    get_market_item,
)
from .database import (
    create_auth_session,
    get_auth_session_identity,
    revoke_all_auth_sessions,
    revoke_auth_session,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _load_auth_env() -> None:
    """Load env from project root and backend directory before reading constants."""
    current_file = Path(__file__).resolve()
    backend_dir = current_file.parents[1]
    project_root = current_file.parents[2]
    load_dotenv(project_root / ".env", override=False)
    load_dotenv(backend_dir / ".env", override=False)


_load_auth_env()

PURPOSE_VERIFY_EMAIL = "verify_email"
PURPOSE_RESET_PASSWORD = "reset_password"

CODE_TTL_SECONDS = int(os.getenv("CODE_TTL_SECONDS", "300"))
RESEND_COOLDOWN_SECONDS = int(os.getenv("RESEND_COOLDOWN_SECONDS", "30"))
SMTP_TIMEOUT_SECONDS = int(os.getenv("SMTP_TIMEOUT_SECONDS", "20"))
HTTP_TIMEOUT_SECONDS = int(os.getenv("HTTP_TIMEOUT_SECONDS", "20"))
EMAIL_TRANSPORT = os.getenv("EMAIL_TRANSPORT", "auto").lower()

SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "465"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_FROM = os.getenv("SMTP_FROM", SMTP_USER)
SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "true").lower() == "true"

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
RESEND_FROM = os.getenv("RESEND_FROM", "")
RESEND_API_URL = os.getenv("RESEND_API_URL", "https://api.resend.com/emails")

MAX_AVATAR_URL_LENGTH = int(os.getenv("MAX_AVATAR_URL_LENGTH", "8000000"))
AUTH_SESSION_TTL_SECONDS = int(
    os.getenv("AUTH_SESSION_TTL_SECONDS", str(60 * 60 * 24 * 30))
)


def _build_email_bodies(code: str, purpose: str) -> tuple[str, str, str]:
    ttl_minutes = max(1, CODE_TTL_SECONDS // 60)
    if purpose == PURPOSE_RESET_PASSWORD:
        title = "Восстановление пароля"
        subtitle = "Введите код в форме восстановления, чтобы задать новый пароль."
    else:
        title = "Подтверждение почты"
        subtitle = "Введите код в окне регистрации, чтобы активировать аккаунт."

    subject = f"{title} | QuizBattle"
    text_body = (
        f"QuizBattle\n\n"
        f"{title}\n"
        f"Ваш код: {code}\n"
        f"Код действует {ttl_minutes} минут.\n\n"
        f"Если вы не запрашивали код, просто проигнорируйте письмо."
    )
    html_body = f"""\
<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#070d24;font-family:Arial,'Helvetica Neue',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#070d24;padding:28px 10px;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:96%;border-radius:18px;overflow:hidden;border:1px solid #243767;background:#0e1737;box-shadow:0 20px 60px rgba(4,10,30,0.55);">
            <tr>
              <td style="padding:30px 28px;background:linear-gradient(140deg,#0f2a66 0%,#1f3f8b 45%,#2d63c8 100%);color:#ffffff;">
                <div style="display:inline-block;padding:6px 12px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);font-size:11px;letter-spacing:0.08em;text-transform:uppercase;background:rgba(255,255,255,0.12);">
                  QuizBattle
                </div>
                <h1 style="margin:14px 0 0;font-size:27px;line-height:1.2;font-weight:700;">
                  {title}
                </h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;opacity:0.96;">
                  {subtitle}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 28px 10px;color:#d9e5ff;">
                <p style="margin:0 0 12px;font-size:14px;color:#a8c0f8;letter-spacing:0.02em;">
                  Ваш код
                </p>
                <div style="display:inline-block;border-radius:14px;padding:2px;background:linear-gradient(140deg,#53b4ff,#8a7bff);">
                  <div style="border-radius:12px;padding:16px 22px;background:#0a1330;">
                    <span style="display:block;font-size:36px;line-height:1;letter-spacing:8px;font-weight:800;color:#ffffff;">
                      {code}
                    </span>
                  </div>
                </div>
                <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#c3d4ff;">
                  Код действует <strong style="color:#ffffff;">{ttl_minutes} минут</strong>.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:12px;border:1px solid #263b6f;background:#111c42;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.6;color:#93a9d8;">
                      Если вы не запрашивали этот код, просто проигнорируйте письмо.
                    </td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font-size:12px;color:#6f84b3;line-height:1.6;">
                  Это автоматическое письмо, отвечать на него не нужно.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""
    return subject, text_body, html_body


def _send_email_via_smtp(email: str, code: str, purpose: str) -> None:
    if not (SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_PASS and SMTP_FROM):
        raise RuntimeError(
            "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM"
        )

    subject, text_body, html_body = _build_email_bodies(code, purpose)
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = SMTP_FROM
    msg["To"] = email
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    if SMTP_USE_SSL:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL(
            SMTP_HOST, SMTP_PORT, context=context, timeout=SMTP_TIMEOUT_SECONDS
        ) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=SMTP_TIMEOUT_SECONDS) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)


def _send_email_via_resend(email: str, code: str, purpose: str) -> None:
    if not (RESEND_API_KEY and RESEND_FROM):
        raise RuntimeError("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM")

    subject, text_body, html_body = _build_email_bodies(code, purpose)
    payload = {
        "from": RESEND_FROM,
        "to": [email],
        "subject": subject,
        "text": text_body,
        "html": html_body,
    }
    data = json.dumps(payload).encode("utf-8")
    req = UrlRequest(
        RESEND_API_URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "QuizBattle/1.0",
        },
    )
    try:
        with urlopen(req, timeout=HTTP_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            if resp.status >= 400:
                raise RuntimeError(f"Resend API error {resp.status}: {body}")
    except urlerror.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Resend API error {exc.code}: {detail}") from exc
    except urlerror.URLError as exc:
        raise RuntimeError(f"Resend connection error: {exc.reason}") from exc


def _send_email_code(email: str, code: str, purpose: str) -> None:
    if EMAIL_TRANSPORT == "resend":
        _send_email_via_resend(email, code, purpose)
        return

    if EMAIL_TRANSPORT == "smtp":
        _send_email_via_smtp(email, code, purpose)
        return

    if EMAIL_TRANSPORT == "auto":
        errors: list[str] = []
        try:
            _send_email_via_resend(email, code, purpose)
            return
        except Exception as exc:
            errors.append(f"resend: {exc}")
        try:
            _send_email_via_smtp(email, code, purpose)
            return
        except Exception as exc:
            errors.append(f"smtp: {exc}")
        raise RuntimeError("; ".join(errors))

    if EMAIL_TRANSPORT == "log":
        # Development fallback: keeps flow working without SMTP/Resend.
        print(f"[auth] {purpose} code for {email}: {code}")
        return

    raise RuntimeError("EMAIL_TRANSPORT must be one of: resend, smtp, auto, log")


async def _get_user_by_email(email: str):
    return await repo_get_user_by_email(email)


async def _get_user_by_id(user_id: int):
    return await repo_get_user_by_id(int(user_id))


async def _get_current_user_and_token(authorization: str | None):
    token = _extract_bearer_token(authorization)
    session = await get_auth_session_identity(token, touch=True)
    if session is None:
        raise HTTPException(status_code=401, detail="Некорректный или истекший токен")

    user = await _get_user_by_id(int(session["user_id"]))
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user, token


async def _get_current_user(authorization: str | None):
    user, _ = await _get_current_user_and_token(authorization)
    return user


async def _upsert_pending_user(email: str, display_name: str, password_hash: str) -> None:
    await repo_upsert_pending_user(email, display_name, password_hash)


async def _mark_email_verified(email: str) -> None:
    await repo_mark_email_verified(email)


async def _store_code(email: str, purpose: str, code: str) -> None:
    expires_at = repo_utc_now() + timedelta(seconds=CODE_TTL_SECONDS)
    await repo_upsert_email_code(email, purpose, code, expires_at)


async def _check_send_cooldown(email: str, purpose: str) -> None:
    row = await repo_get_email_code(email, purpose)

    if row is None:
        return

    last_sent_at = row["last_sent_at"]
    if last_sent_at is None:
        return

    elapsed = (datetime.now(timezone.utc) - last_sent_at).total_seconds()
    if elapsed < RESEND_COOLDOWN_SECONDS:
        wait_seconds = max(1, int(RESEND_COOLDOWN_SECONDS - elapsed))
        raise HTTPException(
            status_code=429,
            detail=f"Подождите {wait_seconds} сек. перед повторной отправкой",
        )


async def _verify_code(email: str, purpose: str, code: str, *, consume: bool) -> None:
    row = await repo_get_email_code(email, purpose)

    if row is None:
        raise HTTPException(status_code=400, detail="Сначала запросите код")

    if row["consumed_at"] is not None:
        raise HTTPException(status_code=400, detail="Код уже использован")

    expires_at = row["expires_at"]
    if expires_at is None or repo_utc_now() > expires_at:
        raise HTTPException(status_code=400, detail="Код истек")

    if row["code"] != code:
        raise HTTPException(status_code=400, detail="Неверный код")

    if consume:
        await repo_consume_email_code(email, purpose)


async def _send_code(email: str, purpose: str) -> None:
    await _check_send_cooldown(email, purpose)
    code = _generate_code()
    try:
        _send_email_code(email, code, purpose)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка отправки письма: {exc}") from exc
    await _store_code(email, purpose, code)


def _serialize_shop_catalog() -> list[dict[str, object]]:
    items: list[dict[str, object]] = []
    for item in MARKET_ITEMS.values():
        items.append(
            {
                "id": item.item_id,
                "title": item.title,
                "description": item.description,
                "price": int(item.price),
                "type": item.item_type,
                "mascotKind": item.mascot_kind,
                "effectLayer": item.victory_effect_layer,
                "effectPath": item.victory_effect_path,
            }
        )
    return sorted(items, key=lambda row: str(row["id"]))


async def _build_shop_state(user_id: int) -> dict[str, object]:
    user = await _get_user_by_id(int(user_id))
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    await repo_ensure_owned_item_ids(int(user_id), DEFAULT_OWNED_MARKET_ITEM_IDS)

    front_effect = (
        str(user.get("equipped_victory_front_effect")).strip()
        if user.get("equipped_victory_front_effect") is not None
        else ""
    )
    back_effect = (
        str(user.get("equipped_victory_back_effect")).strip()
        if user.get("equipped_victory_back_effect") is not None
        else ""
    )

    # Backward compatibility: older records could store winner background in front slot.
    if front_effect == DEFAULT_EQUIPPED_VICTORY_BACK_EFFECT_ITEM_ID and not back_effect:
        await repo_equip_victory_effect(
            int(user_id),
            "front",
            DEFAULT_EQUIPPED_VICTORY_FRONT_EFFECT_ITEM_ID,
        )
        await repo_equip_victory_effect(
            int(user_id),
            "back",
            DEFAULT_EQUIPPED_VICTORY_BACK_EFFECT_ITEM_ID,
        )
        user = await _get_user_by_id(int(user_id))
    else:
        needs_default_front = not front_effect
        needs_default_back = not back_effect
        if needs_default_front:
            await repo_equip_victory_effect(
                int(user_id),
                "front",
                DEFAULT_EQUIPPED_VICTORY_FRONT_EFFECT_ITEM_ID,
            )
        if needs_default_back:
            await repo_equip_victory_effect(
                int(user_id),
                "back",
                DEFAULT_EQUIPPED_VICTORY_BACK_EFFECT_ITEM_ID,
            )
        if needs_default_front or needs_default_back:
            user = await _get_user_by_id(int(user_id))

    owned_item_ids = await repo_get_owned_item_ids(int(user_id))
    return {
        "balance": int(user.get("coins", 0) or 0),
        "ownedItemIds": owned_item_ids,
        "equipped": {
            "profileFrame": user.get("profile_frame"),
            "catSkin": user.get("equipped_cat_skin"),
            "dogSkin": user.get("equipped_dog_skin"),
            "victoryFrontEffect": user.get("equipped_victory_front_effect"),
            "victoryBackEffect": user.get("equipped_victory_back_effect"),
        },
    }


@router.post("/register")
async def register(payload: RegisterRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")

    display_name = (payload.full_name or "").strip()
    if not display_name:
        raise HTTPException(status_code=400, detail="Введите имя")

    if payload.password != payload.password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")

    password_policy_error = _validate_password_policy(payload.password)
    if password_policy_error:
        raise HTTPException(status_code=400, detail=password_policy_error)

    user = await _get_user_by_email(email)
    if user is not None and user["is_email_verified"]:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")

    password_hash = _hash_password(payload.password)
    await _upsert_pending_user(email, display_name, password_hash)
    await _send_code(email, PURPOSE_VERIFY_EMAIL)

    return {
        "ok": True,
        "message": "Код подтверждения отправлен на почту",
        "expires_in": CODE_TTL_SECONDS,
    }


@router.post("/resend-verification")
async def resend_verification(payload: EmailRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    if user["is_email_verified"]:
        raise HTTPException(status_code=400, detail="Почта уже подтверждена")

    await _send_code(email, PURPOSE_VERIFY_EMAIL)
    return {
        "ok": True,
        "message": "Код отправлен повторно",
        "expires_in": CODE_TTL_SECONDS,
    }


@router.post("/verify-email")
async def verify_email(payload: VerifyCodeRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    code = _normalize_code(payload.code)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")
    if not code:
        raise HTTPException(status_code=400, detail="Введите код")

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    await _verify_code(email, PURPOSE_VERIFY_EMAIL, code, consume=True)
    await _mark_email_verified(email)
    return {"ok": True, "message": "Email успешно подтвержден"}


@router.get("/me")
async def me(authorization: str | None = Header(default=None)) -> dict[str, object]:
    user = await _get_current_user(authorization)
    return {
        "ok": True,
        "user": _serialize_user(user),
    }


@router.get("/shop")
async def get_shop(authorization: str | None = Header(default=None)) -> dict[str, object]:
    user = await _get_current_user(authorization)
    state = await _build_shop_state(int(user["id"]))
    return {
        "ok": True,
        "currency": "stars",
        "catalog": _serialize_shop_catalog(),
        "state": state,
    }


@router.post("/shop/buy")
async def buy_shop_item(
    payload: ShopBuyRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    user = await _get_current_user(authorization)
    await repo_ensure_owned_item_ids(int(user["id"]), DEFAULT_OWNED_MARKET_ITEM_IDS)
    item = get_market_item(payload.item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Предмет не найден")

    result = await repo_buy_market_item(int(user["id"]), item.item_id, item.price)
    if not result.get("ok"):
        error_code = str(result.get("error") or "")
        if error_code == "ALREADY_OWNED":
            raise HTTPException(status_code=409, detail="Предмет уже куплен")
        if error_code == "NOT_ENOUGH_COINS":
            raise HTTPException(status_code=400, detail="Недостаточно звёзд")
        if error_code == "USER_NOT_FOUND":
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        raise HTTPException(status_code=400, detail="Не удалось купить предмет")

    state = await _build_shop_state(int(user["id"]))
    return {"ok": True, "state": state}


@router.post("/shop/equip")
async def equip_shop_item(
    payload: ShopEquipRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    user = await _get_current_user(authorization)
    user_id = int(user["id"])
    await repo_ensure_owned_item_ids(user_id, DEFAULT_OWNED_MARKET_ITEM_IDS)
    item_id = (payload.item_id or "").strip()
    target = (payload.target or "").strip().lower()

    if target in {"profile_frame", "frame"}:
        if item_id:
            item = get_market_item(item_id)
            if item is None or item.item_type != "profile_frame":
                raise HTTPException(status_code=400, detail="Неверная рамка профиля")
            owned_item_ids = await repo_get_owned_item_ids(user_id)
            if item.item_id not in owned_item_ids:
                raise HTTPException(status_code=403, detail="Сначала купите эту рамку")
        await repo_equip_profile_frame(user_id, item_id or None)
        state = await _build_shop_state(user_id)
        return {"ok": True, "state": state}

    if target in {"cat", "dog"}:
        if item_id:
            item = get_market_item(item_id)
            if (
                item is None
                or item.item_type != "mascot_skin"
                or item.mascot_kind != target
            ):
                raise HTTPException(status_code=400, detail="Неверный скин талисмана")
            owned_item_ids = await repo_get_owned_item_ids(user_id)
            if item.item_id not in owned_item_ids:
                raise HTTPException(status_code=403, detail="Сначала купите этот скин")
        await repo_equip_mascot_skin(user_id, target, item_id or None)
        state = await _build_shop_state(user_id)
        return {"ok": True, "state": state}

    if target in {"victory_front", "victory_back"}:
        layer = "front" if target == "victory_front" else "back"
        if not item_id:
            raise HTTPException(
                status_code=400,
                detail="Эффект победы нельзя снять. Выберите другой эффект.",
            )
        item = get_market_item(item_id)
        if (
            item is None
            or item.item_type != "victory_effect"
            or item.victory_effect_layer != layer
        ):
            raise HTTPException(status_code=400, detail="Неверный эффект победы")
        owned_item_ids = await repo_get_owned_item_ids(user_id)
        if item.item_id not in owned_item_ids:
            raise HTTPException(status_code=403, detail="Сначала купите этот эффект")
        await repo_equip_victory_effect(user_id, layer, item_id)
        state = await _build_shop_state(user_id)
        return {"ok": True, "state": state}

    raise HTTPException(
        status_code=400,
        detail="Укажите target: profile_frame, cat, dog, victory_front или victory_back",
    )


@router.post("/logout")
async def logout(authorization: str | None = Header(default=None)) -> dict[str, object]:
    token = _extract_bearer_token(authorization)
    await revoke_auth_session(token)
    return {"ok": True}


@router.post("/logout-all")
async def logout_all(authorization: str | None = Header(default=None)) -> dict[str, object]:
    user = await _get_current_user(authorization)
    revoked = await revoke_all_auth_sessions(int(user["id"]))
    return {"ok": True, "revoked": revoked}


@router.patch("/profile")
async def update_profile(
    payload: UpdateProfileRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    user = await _get_current_user(authorization)

    display_name_to_save: str | None = None
    if payload.display_name is not None:
        display_name_to_save = payload.display_name.strip()
        if not display_name_to_save:
            raise HTTPException(status_code=400, detail="Имя не может быть пустым")

    avatar_to_save = payload.avatar_url if payload.avatar_url is not None else None
    if avatar_to_save is not None and len(avatar_to_save) > MAX_AVATAR_URL_LENGTH:
        raise HTTPException(status_code=400, detail="Аватар слишком большой. Выберите изображение меньше.")
    if display_name_to_save is None and avatar_to_save is None:
        raise HTTPException(status_code=400, detail="Нет данных для обновления")

    row = await repo_update_profile(int(user["id"]), display_name_to_save, avatar_to_save)

    if row is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return {"ok": True, "user": _serialize_user(row)}


@router.post("/change-email")
async def change_email(
    payload: ChangeEmailRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    user, current_token = await _get_current_user_and_token(authorization)
    new_email = _normalize_email(payload.new_email)
    if not _validate_email(new_email):
        raise HTTPException(status_code=400, detail="Введите корректный email")

    if not _verify_password(payload.current_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный текущий пароль")

    if new_email == user["email"]:
        raise HTTPException(status_code=400, detail="Новый email совпадает с текущим")

    existing = await _get_user_by_email(new_email)
    if existing is not None and existing["id"] != user["id"]:
        raise HTTPException(status_code=409, detail="Email уже используется")

    row = await repo_update_user_email(int(user["id"]), new_email)
    await repo_delete_codes_for_email(str(user["email"]))

    if row is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    new_access_token = await create_auth_session(
        user_id=int(user["id"]),
        ttl_seconds=AUTH_SESSION_TTL_SECONDS,
        user_agent=request.headers.get("user-agent"),
        ip_address=_extract_client_ip(request),
    )
    await revoke_auth_session(current_token)

    return {
        "ok": True,
        "message": "Email успешно изменен",
        "access_token": new_access_token,
        "user": _serialize_user(row),
    }


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    user = await _get_current_user(authorization)

    if not _verify_password(payload.old_password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный текущий пароль")

    if payload.new_password != payload.new_password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")

    password_policy_error = _validate_password_policy(payload.new_password)
    if password_policy_error:
        raise HTTPException(status_code=400, detail=password_policy_error)

    if _verify_password(payload.new_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Новый пароль должен отличаться от старого")

    new_hash = _hash_password(payload.new_password)
    await repo_update_user_password(int(user["id"]), new_hash)

    return {"ok": True, "message": "Пароль успешно изменен"}


@router.post("/login")
async def login(payload: LoginRequest, request: Request) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not _verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    if not user["is_email_verified"]:
        raise HTTPException(status_code=403, detail="Подтвердите почту перед входом")

    await repo_touch_last_login(email)

    access_token = await create_auth_session(
        user_id=int(user["id"]),
        ttl_seconds=AUTH_SESSION_TTL_SECONDS,
        user_agent=request.headers.get("user-agent"),
        ip_address=_extract_client_ip(request),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


@router.post("/forgot-password")
async def forgot_password(payload: EmailRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")

    user = await _get_user_by_email(email)
    if user is None or not user["is_email_verified"]:
        return {
            "ok": True,
            "message": "Если аккаунт существует, код отправлен на почту",
        }

    await _send_code(email, PURPOSE_RESET_PASSWORD)
    return {
        "ok": True,
        "message": "Письмо с кодом отправлено. Проверьте почту.",
        "expires_in": CODE_TTL_SECONDS,
    }


@router.post("/verify-reset")
async def verify_reset(payload: VerifyResetRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    token = _normalize_code(payload.token)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")
    if not token:
        raise HTTPException(status_code=400, detail="Введите код")

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=400, detail="Неверный код")

    await _verify_code(email, PURPOSE_RESET_PASSWORD, token, consume=False)
    return {"ok": True, "message": "Код подтвержден"}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest) -> dict[str, object]:
    email = _normalize_email(payload.email)
    token = _normalize_code(payload.token)
    if not _validate_email(email):
        raise HTTPException(status_code=400, detail="Введите корректный email")
    if not token:
        raise HTTPException(status_code=400, detail="Введите код")
    if payload.new_password != payload.new_password_confirm:
        raise HTTPException(status_code=400, detail="Пароли не совпадают")

    password_policy_error = _validate_password_policy(payload.new_password)
    if password_policy_error:
        raise HTTPException(status_code=400, detail=password_policy_error)

    user = await _get_user_by_email(email)
    if user is None:
        raise HTTPException(status_code=400, detail="Неверный код")

    await _verify_code(email, PURPOSE_RESET_PASSWORD, token, consume=True)
    new_hash = _hash_password(payload.new_password)

    await repo_update_user_password(int(user["id"]), new_hash)
    await revoke_all_auth_sessions(int(user["id"]))

    return {"ok": True, "message": "Пароль успешно обновлен"}
