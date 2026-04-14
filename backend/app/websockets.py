"""WebSocket endpoints for host and player connections."""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.database import SessionLocal
from app.game import run_game
from app.rooms import manager
from app.schemas import (
    ErrorMessage,
    JoinedAck,
    PlayerInfo,
    PlayerJoined,
    PlayerLeft,
    RoomCreated,
)

router = APIRouter()


MAX_NICKNAME_LEN = 20


@router.websocket("/ws/host")
async def websocket_host(websocket: WebSocket) -> None:
    """Host connects to create a new game room."""
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
                asyncio.create_task(run_game(room))
            else:
                await websocket.send_json(
                    ErrorMessage(message=f"Unknown message type: {msg_type}").model_dump()
                )
    except WebSocketDisconnect:
        pass
    finally:
        # When host disconnects, tear down the room.
        try:
            if "room" in locals():
                await manager.close_room(room.code)
        finally:
            db.close()


@router.websocket("/ws/play/{room_code}")
async def websocket_play(
    websocket: WebSocket,
    room_code: str,
    nickname: str = Query(..., min_length=1, max_length=MAX_NICKNAME_LEN),
) -> None:
    """Player connects to join an existing room."""
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
                # Only accept if a round is in progress and player hasn't answered yet
                current_answers = getattr(room, "current_answers", None)
                if current_answers is None:
                    await websocket.send_json(
                        ErrorMessage(message="No active round").model_dump()
                    )
                    continue
                if player.id in current_answers:
                    await websocket.send_json(
                        ErrorMessage(message="You already answered this round").model_dump()
                    )
                    continue
                choice = data.get("choice")
                response_time_ms = int(data.get("response_time_ms", 0))
                if not isinstance(choice, str):
                    await websocket.send_json(
                        ErrorMessage(message="Invalid choice").model_dump()
                    )
                    continue
                current_answers[player.id] = (choice, response_time_ms)
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
