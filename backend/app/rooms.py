"""In-memory room manager for live game state and WebSocket broadcasts."""
from __future__ import annotations

import asyncio
import random
import string
from dataclasses import dataclass, field

from fastapi import WebSocket
from sqlalchemy.orm import Session

from app.models import Game, GameStatus, Player


ROOM_CODE_LENGTH = 4
ROOM_CODE_ALPHABET = string.ascii_uppercase  # no digits to avoid 0/O confusion


@dataclass
class LivePlayer:
    id: int
    nickname: str
    score: int = 0
    websocket: WebSocket | None = None


@dataclass
class Room:
    code: str
    game_id: int
    host_ws: WebSocket
    players: dict[int, LivePlayer] = field(default_factory=dict)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    game_task: asyncio.Task | None = None
    current_round_id: int | None = None
    current_answers: dict[int, tuple[str, int]] = field(default_factory=dict)

    def player_list(self) -> list[dict]:
        return [
            {"id": p.id, "nickname": p.nickname, "score": p.score}
            for p in self.players.values()
        ]

    async def broadcast(
        self,
        message: dict,
        *,
        include_host: bool = True,
        exclude_player_ids: set[int] | None = None,
    ) -> None:
        """Send a JSON message to every connected player (and optionally the host)."""
        excluded = exclude_player_ids or set()
        targets: list[WebSocket] = []
        if include_host:
            targets.append(self.host_ws)
        # Snapshot to avoid "dict changed size during iteration" if a player disconnects mid-broadcast.
        targets.extend(
            p.websocket
            for pid, p in list(self.players.items())
            if p.websocket and pid not in excluded
        )

        for ws in targets:
            try:
                await ws.send_json(message)
            except Exception:
                # Connection may have dropped; ignore — cleanup happens on disconnect.
                pass

    async def send_to_player(self, player_id: int, message: dict) -> None:
        player = self.players.get(player_id)
        if player and player.websocket:
            try:
                await player.websocket.send_json(message)
            except Exception:
                pass


class RoomManager:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}
        self._lock = asyncio.Lock()

    def _generate_code(self) -> str:
        return "".join(random.choices(ROOM_CODE_ALPHABET, k=ROOM_CODE_LENGTH))

    async def create_room(self, db: Session, host_ws: WebSocket) -> Room:
        async with self._lock:
            # Find an unused code
            for _ in range(50):
                code = self._generate_code()
                if code not in self._rooms:
                    break
            else:
                raise RuntimeError("Could not generate unique room code")

            game = Game(room_code=code, status=GameStatus.LOBBY)
            db.add(game)
            db.commit()
            db.refresh(game)

            room = Room(code=code, game_id=game.id, host_ws=host_ws)
            self._rooms[code] = room
            return room

    def get(self, code: str) -> Room | None:
        return self._rooms.get(code.upper())

    async def add_player(
        self, db: Session, room: Room, nickname: str, websocket: WebSocket
    ) -> LivePlayer:
        async with room.lock:
            player = Player(game_id=room.game_id, nickname=nickname)
            db.add(player)
            db.commit()
            db.refresh(player)

            live = LivePlayer(id=player.id, nickname=nickname, websocket=websocket)
            room.players[player.id] = live
            return live

    async def remove_player(self, room: Room, player_id: int) -> None:
        async with room.lock:
            room.players.pop(player_id, None)

    async def close_room(self, code: str) -> Room | None:
        async with self._lock:
            room = self._rooms.pop(code, None)
        if room is not None and room.game_task is not None and not room.game_task.done():
            room.game_task.cancel()
            try:
                await room.game_task
            except (asyncio.CancelledError, Exception):
                pass
        return room


# Singleton manager used by the API
manager = RoomManager()
