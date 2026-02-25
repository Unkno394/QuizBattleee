from __future__ import annotations

from sqlalchemy import DateTime, Integer, JSON, String, Text, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class RoomSnapshot(Base):
    __tablename__ = "room_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[str] = mapped_column(String(8), unique=True, nullable=False, index=True)
    topic: Mapped[str] = mapped_column(String(80), nullable=False)
    question_count: Mapped[int] = mapped_column(Integer, nullable=False)
    state_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class GameResult(Base):
    __tablename__ = "game_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    room_id: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    team_a_name: Mapped[str] = mapped_column(String(32), nullable=False)
    team_b_name: Mapped[str] = mapped_column(String(32), nullable=False)
    score_a: Mapped[int] = mapped_column(Integer, nullable=False)
    score_b: Mapped[int] = mapped_column(Integer, nullable=False)
    winner_team: Mapped[str | None] = mapped_column(String(1), nullable=True)
    payload_json: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), index=True
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    display_name: Mapped[str] = mapped_column(String(64), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[str] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
