"""Regression tests for validation and join-guard bugs."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.database import SessionLocal
from app.main import app
from app.models import Game, GameStatus
from app.rooms import manager
from app.schemas import SubmitAnswerMessage


def _reset_rooms() -> None:
    manager._rooms.clear()


def test_negative_response_time_is_rejected() -> None:
    """Bug C1: a negative response_time_ms used to inflate the score above MAX_POINTS."""
    with pytest.raises(ValidationError):
        SubmitAnswerMessage.model_validate(
            {"type": "submit_answer", "choice": "x", "response_time_ms": -1}
        )


def test_oversized_choice_is_rejected() -> None:
    """Bug M5: a >256-char choice would crash the game loop on DB commit."""
    too_long = "a" * 257
    with pytest.raises(ValidationError):
        SubmitAnswerMessage.model_validate(
            {"type": "submit_answer", "choice": too_long, "response_time_ms": 0}
        )


def test_malformed_response_time_is_rejected() -> None:
    """Bug M4: a non-int response_time_ms used to crash the WS handler."""
    with pytest.raises(ValidationError):
        SubmitAnswerMessage.model_validate(
            {"type": "submit_answer", "choice": "x", "response_time_ms": "fast"}
        )


def test_join_after_game_started_is_rejected() -> None:
    """Bug H1: late joiners used to be added mid-game and broke round bookkeeping."""
    _reset_rooms()
    client = TestClient(app)
    with client.websocket_connect("/ws/host") as host:
        room = host.receive_json()
        code = room["room_code"]

        # Mark the game as IN_PROGRESS without actually running it.
        db = SessionLocal()
        try:
            game = db.get(Game, room["game_id"])
            game.status = GameStatus.IN_PROGRESS
            db.commit()
        finally:
            db.close()

        with client.websocket_connect(f"/ws/play/{code}?nickname=Late") as ws:
            msg = ws.receive_json()
            assert msg["type"] == "error"
            assert "no longer accepting" in msg["message"].lower()
