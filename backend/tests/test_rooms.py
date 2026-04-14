"""Integration tests for the WebSocket room flow."""
from fastapi.testclient import TestClient

from app.main import app
from app.rooms import manager


def _reset_rooms() -> None:
    manager._rooms.clear()


def test_host_creates_room_and_receives_code() -> None:
    _reset_rooms()
    client = TestClient(app)
    with client.websocket_connect("/ws/host") as host:
        msg = host.receive_json()
        assert msg["type"] == "room_created"
        assert len(msg["room_code"]) == 4
        assert msg["game_id"] > 0


def test_player_can_join_room() -> None:
    _reset_rooms()
    client = TestClient(app)
    with client.websocket_connect("/ws/host") as host:
        host_msg = host.receive_json()
        code = host_msg["room_code"]

        with client.websocket_connect(
            f"/ws/play/{code}?nickname=Alice"
        ) as player:
            joined = player.receive_json()
            assert joined["type"] == "joined"
            assert joined["room_code"] == code
            assert len(joined["players"]) == 1
            assert joined["players"][0]["nickname"] == "Alice"

            host_notify = host.receive_json()
            assert host_notify["type"] == "player_joined"
            assert host_notify["player"]["nickname"] == "Alice"


def test_multiple_players_see_each_other() -> None:
    _reset_rooms()
    client = TestClient(app)
    with client.websocket_connect("/ws/host") as host:
        code = host.receive_json()["room_code"]

        with client.websocket_connect(f"/ws/play/{code}?nickname=Alice") as alice:
            alice.receive_json()  # joined ack
            host.receive_json()  # player_joined

            with client.websocket_connect(f"/ws/play/{code}?nickname=Bob") as bob:
                bob_joined = bob.receive_json()
                assert len(bob_joined["players"]) == 2
                nicknames = {p["nickname"] for p in bob_joined["players"]}
                assert nicknames == {"Alice", "Bob"}

                # Alice should receive a player_joined notification about Bob
                alice_notify = alice.receive_json()
                assert alice_notify["type"] == "player_joined"
                assert alice_notify["player"]["nickname"] == "Bob"


def test_unknown_room_code_rejected() -> None:
    _reset_rooms()
    client = TestClient(app)
    with client.websocket_connect("/ws/play/ZZZZ?nickname=Alice") as ws:
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "not found" in msg["message"].lower()
