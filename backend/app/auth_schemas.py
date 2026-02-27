from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=64)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    password_confirm: str = Field(min_length=1, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class EmailRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class VerifyCodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    code: str = Field(min_length=1, max_length=16)


class VerifyResetRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    token: str = Field(min_length=1, max_length=16)


class ResetPasswordRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    token: str = Field(min_length=1, max_length=16)
    new_password: str = Field(min_length=1, max_length=128)
    new_password_confirm: str = Field(min_length=1, max_length=128)


class UpdateProfileRequest(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    avatar_url: str | None = None
    preferred_mascot: str | None = Field(default=None, max_length=8)


class ChangeEmailRequest(BaseModel):
    new_email: str = Field(min_length=5, max_length=255)
    current_password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)
    new_password_confirm: str = Field(min_length=1, max_length=128)


class ShopBuyRequest(BaseModel):
    item_id: str = Field(min_length=1, max_length=64)


class ShopEquipRequest(BaseModel):
    item_id: str | None = Field(default=None, max_length=64)
    target: str | None = Field(default=None, max_length=16)
