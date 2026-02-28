from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class CreateRoomRequest(BaseModel):
    topic: str = Field(default="Искусственный интеллект", max_length=80)
    difficulty: Literal["easy", "medium", "hard", "progressive"] = Field(default="medium")
    questionCount: int = Field(default=5, ge=5, le=7)
    gameMode: Literal["classic", "ffa", "chaos"] = Field(default="classic")
    roomType: Literal["public", "password"] = Field(default="public")
    roomPassword: str | None = Field(default=None, min_length=1, max_length=64)

    @model_validator(mode="after")
    def validate_room_password(self) -> "CreateRoomRequest":
        password = (self.roomPassword or "").strip()
        if self.roomType == "password":
            if len(password) < 3:
                raise ValueError("Пароль комнаты должен содержать минимум 3 символа")
            self.roomPassword = password[:64]
        else:
            self.roomPassword = None
        return self


class VerifyRoomPasswordRequest(BaseModel):
    password: str = Field(default="", max_length=64)


class QuickGameQuestionsRequest(BaseModel):
    topic: str = Field(default="Общая эрудиция", max_length=80)
    difficulty: Literal["easy", "medium", "hard", "progressive"] = Field(default="medium")
    questionCount: int = Field(default=7, ge=5, le=7)


class QuickGameAnswerItem(BaseModel):
    questionId: str = Field(min_length=1, max_length=16)
    selectedIndex: int | None = Field(default=None, ge=0, le=3)


class QuickGameCompleteRequest(BaseModel):
    rewardToken: str = Field(min_length=1, max_length=4000)
    answers: list[QuickGameAnswerItem] = Field(default_factory=list, max_length=7)
