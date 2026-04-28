"""Pydantic schemas for WebSocket message payloads."""
from typing import Annotated, Literal

from pydantic import BaseModel, Field


# --- Outbound (server -> client) ---


class PlayerInfo(BaseModel):
    id: int
    nickname: str
    score: int = 0


class RoomCreated(BaseModel):
    type: Literal["room_created"] = "room_created"
    room_code: str
    game_id: int


class PlayerJoined(BaseModel):
    type: Literal["player_joined"] = "player_joined"
    player: PlayerInfo
    players: list[PlayerInfo]


class PlayerLeft(BaseModel):
    type: Literal["player_left"] = "player_left"
    player_id: int
    players: list[PlayerInfo]


class JoinedAck(BaseModel):
    """Sent to the joining player confirming their identity."""

    type: Literal["joined"] = "joined"
    player_id: int
    room_code: str
    players: list[PlayerInfo]


class ErrorMessage(BaseModel):
    type: Literal["error"] = "error"
    message: str


# --- Inbound (client -> server) ---


_BoundedShort = Annotated[str, Field(min_length=1, max_length=256)]


class CustomQuestionInput(BaseModel):
    """A single host-supplied question. First answer is correct."""

    text: str = Field(min_length=1, max_length=500)
    correct_answer: _BoundedShort
    incorrect_answers: list[_BoundedShort] = Field(min_length=1, max_length=10)


class StartGameMessage(BaseModel):
    type: Literal["start_game"]
    # Bound each category string so a malicious host can't drop a 10 MB
    # entry into the WS message and balloon server memory.
    categories: list[_BoundedShort] | None = None
    custom_questions: list[CustomQuestionInput] | None = Field(
        default=None, max_length=25
    )


class SubmitAnswerMessage(BaseModel):
    type: Literal["submit_answer"]
    choice: str = Field(min_length=1, max_length=256)
    response_time_ms: int = Field(ge=0)


# --- Game events (to be used in later task) ---


class RoundStart(BaseModel):
    type: Literal["round_start"] = "round_start"
    round_number: int
    total_rounds: int
    question: str
    options: list[str]
    duration_seconds: int


class RoundEnd(BaseModel):
    type: Literal["round_end"] = "round_end"
    correct_answer: str
    leaderboard: list[PlayerInfo]


class GameOver(BaseModel):
    type: Literal["game_over"] = "game_over"
    leaderboard: list[PlayerInfo]


class HostLeft(BaseModel):
    type: Literal["host_left"] = "host_left"
