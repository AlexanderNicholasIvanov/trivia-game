"""WebSocket endpoints for host and player connections."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.config import settings
from app.database import SessionLocal
from app.game import run_game
from app.models import Game, GameStatus
from app.rooms import manager
from app.schemas import (
    ErrorMessage,
    HostLeft,
    JoinedAck,
    PlayerInfo,
    PlayerJoined,
    PlayerLeft,
    RoomCreated,
    StartGameMessage,
    SubmitAnswerMessage,
)

router = APIRouter()


MAX_NICKNAME_LEN = 20

# WebSocket close code for policy violation (origin not allowed).
WS_POLICY_VIOLATION = 1008


def _origin_allowed(websocket: WebSocket) -> bool:
    """Check the WS upgrade `Origin` header against the configured allowlist.

    The CORS HTTP middleware does not cover WebSocket upgrades, so we enforce
    the same allowlist here. Same-origin requests (Origin matches the request
    host) are always allowed.
    """
    allowed = settings.cors_origins_list
    origin = websocket.headers.get("origin")
    if origin is None:
        # Non-browser clients (curl, native apps, tests) don't send Origin.
        return True
    if not allowed:
        return True
    if origin in allowed:
        return True
    # Same-origin: scheme://host[:port] of the request equals Origin.
    request_host = websocket.headers.get("host")
    if request_host is not None:
        scheme = "https" if websocket.url.scheme == "wss" else "http"
        if origin == f"{scheme}://{request_host}":
            return True
    return False


@router.websocket("/ws/host")
async def websocket_host(websocket: WebSocket) -> None:
    """Host connects to create a new game room."""
    if not _origin_allowed(websocket):
        await websocket.close(code=WS_POLICY_VIOLATION)
        return
    await websocket.accept()
    db = SessionLocal()
    try:
        room = await manager.create_room(db, websocket)
        await websocket.send_json(
            RoomCreated(room_code=room.code, game_id=room.game_id).model_dump()
        )

        # Keep the connection open — receive messages from host (start_game, etc.)
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            # Host-driven messages (start_game, etc.) will be handled in the game loop task.
            # For now, echo unknown messages back as an error for easier debugging.
            msg_type = data.get("type") if isinstance(data, dict) else None
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "start_game":
                # Kick off the game loop as a background task so we keep receiving host messages.
                # Track it on the room so close_room can cancel it on disconnect.
                try:
                    parsed_start = StartGameMessage.model_validate(data)
                except ValidationError as exc:
                    first_error = exc.errors()[0]
                    field = ".".join(str(p) for p in first_error["loc"])
                    await websocket.send_json(
                        ErrorMessage(
                            message=f"Invalid start_game ({field}): {first_error['msg']}"
                        ).model_dump()
                    )
                    continue
                if room.game_task is None or room.game_task.done():
                    room.game_task = asyncio.create_task(
                        run_game(room, parsed_start.categories)
                    )
            else:
                await websocket.send_json(
                    ErrorMessage(message=f"Unknown message type: {msg_type}").model_dump()
                )
    except WebSocketDisconnect:
        pass
    finally:
        # When host disconnects, tear down the room and notify players.
        try:
            if "room" in locals():
                closed = await manager.close_room(room.code)
                if closed is not None:
                    host_left_msg = HostLeft().model_dump()
                    await closed.broadcast(host_left_msg, include_host=False)
                    for live in list(closed.players.values()):
                        if live.websocket is not None:
                            try:
                                await live.websocket.close()
                            except Exception:
                                pass
        finally:
            db.close()


@router.websocket("/ws/play/{room_code}")
async def websocket_play(
    websocket: WebSocket,
    room_code: str,
    nickname: str = Query(..., min_length=1, max_length=MAX_NICKNAME_LEN),
) -> None:
    """Player connects to join an existing room."""
    if not _origin_allowed(websocket):
        await websocket.close(code=WS_POLICY_VIOLATION)
        return
    await websocket.accept()

    room = manager.get(room_code)
    if room is None:
        await websocket.send_json(
            ErrorMessage(message=f"Room '{room_code}' not found").model_dump()
        )
        await websocket.close()
        return

    # Basic nickname hygiene
    clean_nick = nickname.strip()
    if not clean_nick:
        await websocket.send_json(
            ErrorMessage(message="Nickname cannot be empty").model_dump()
        )
        await websocket.close()
        return

    # Reject joins for any game that's already past the lobby phase.
    status_db = SessionLocal()
    try:
        game = status_db.get(Game, room.game_id)
        if game is None or game.status != GameStatus.LOBBY:
            await websocket.send_json(
                ErrorMessage(message="Game is no longer accepting players").model_dump()
            )
            await websocket.close()
            return
    finally:
        status_db.close()

    db = SessionLocal()
    player = None
    try:
        player = await manager.add_player(db, room, clean_nick, websocket)

        # Confirm join to the new player
        await websocket.send_json(
            JoinedAck(
                player_id=player.id,
                room_code=room.code,
                players=[PlayerInfo(**p) for p in room.player_list()],
            ).model_dump()
        )

        # Notify everyone else (host + other players) that a player joined.
        # Exclude the joining player — they already got the JoinedAck.
        await room.broadcast(
            PlayerJoined(
                player=PlayerInfo(id=player.id, nickname=player.nickname, score=0),
                players=[PlayerInfo(**p) for p in room.player_list()],
            ).model_dump(),
            exclude_player_ids={player.id},
        )

        # Listen for player messages (answers, etc.)
        while True:
            try:
                data = await websocket.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = data.get("type") if isinstance(data, dict) else None
            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
            elif msg_type == "submit_answer":
                if room.current_round_id is None:
                    await websocket.send_json(
                        ErrorMessage(message="No active round").model_dump()
                    )
                    continue
                if player.id in room.current_answers:
                    await websocket.send_json(
                        ErrorMessage(message="You already answered this round").model_dump()
                    )
                    continue
                try:
                    parsed = SubmitAnswerMessage.model_validate(data)
                except ValidationError as exc:
                    first_error = exc.errors()[0]
                    field = ".".join(str(p) for p in first_error["loc"])
                    await websocket.send_json(
                        ErrorMessage(
                            message=f"Invalid submit_answer ({field}): {first_error['msg']}"
                        ).model_dump()
                    )
                    continue
                room.current_answers[player.id] = (parsed.choice, parsed.response_time_ms)
            else:
                await websocket.send_json(
                    ErrorMessage(message=f"Unknown message type: {msg_type}").model_dump()
                )
    except WebSocketDisconnect:
        pass
    finally:
        if player is not None:
            await manager.remove_player(room, player.id)
            await room.broadcast(
                PlayerLeft(
                    player_id=player.id,
                    players=[PlayerInfo(**p) for p in room.player_list()],
                ).model_dump()
            )
        db.close()
