"""End-to-end game loop tests."""
from __future__ import annotations

from unittest.mock import patch

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import Game
from app.rooms import manager


def _reset_rooms() -> None:
    manager._rooms.clear()


def test_full_game_happy_path() -> None:
    """Run a 2-round game with 1 player; verify the full message flow."""
    _reset_rooms()

    # Shrink the game to 2 rounds and 1s round duration for a fast test.
    with (
        patch("app.game.ROUND_DURATION_SECONDS", 1),
        patch("app.game.BETWEEN_ROUNDS_SECONDS", 0),
    ):
        client = TestClient(app)
        with client.websocket_connect("/ws/host") as host:
            room_created = host.receive_json()
            code = room_created["room_code"]

            with client.websocket_connect(f"/ws/play/{code}?nickname=Alice") as alice:
                alice.receive_json()  # joined ack
                host.receive_json()  # player_joined

                # Override total_rounds to 2 by poking the DB directly
                from app.database import SessionLocal
                from app.models import Game

                db = SessionLocal()
                game = db.get(Game, room_created["game_id"])
                game.total_rounds = 2
                db.commit()
                db.close()

                # Host starts the game
                host.send_json({"type": "start_game"})

                # Round 1 start (both host and player should receive it)
                host_round_start = host.receive_json()
                assert host_round_start["type"] == "round_start"
                alice_round_start = alice.receive_json()
                assert alice_round_start["type"] == "round_start"
                assert alice_round_start["round_number"] == 1

                # Alice submits an answer (pick the first option)
                alice.send_json(
                    {
                        "type": "submit_answer",
                        "choice": alice_round_start["options"][0],
                        "response_time_ms": 500,
                    }
                )

                # Round 1 end
                host_round_end = host.receive_json()
                assert host_round_end["type"] == "round_end"
                assert "correct_answer" in host_round_end
                alice.receive_json()  # round_end

                # Round 2 start
                host_r2_start = host.receive_json()
                assert host_r2_start["type"] == "round_start"
                assert host_r2_start["round_number"] == 2
                alice_r2_start = alice.receive_json()

                alice.send_json(
                    {
                        "type": "submit_answer",
                        "choice": alice_r2_start["options"][0],
                        "response_time_ms": 500,
                    }
                )

                # Round 2 end
                host.receive_json()
                alice.receive_json()

                # Game over
                host_end = host.receive_json()
                assert host_end["type"] == "game_over"
                assert len(host_end["leaderboard"]) == 1
                assert host_end["leaderboard"][0]["nickname"] == "Alice"

                alice_end = alice.receive_json()
                assert alice_end["type"] == "game_over"


def test_custom_questions_drive_the_round_text() -> None:
    """A host-supplied custom pack should be used verbatim."""
    _reset_rooms()
    custom = [
        {
            "text": "What is the airspeed velocity of an unladen swallow?",
            "correct_answer": "African or European?",
            "incorrect_answers": ["10mph", "20mph", "30mph"],
        },
        {
            "text": "Pick the right one.",
            "correct_answer": "this one",
            "incorrect_answers": ["nope", "nope", "nope"],
        },
    ]
    with (
        patch("app.game.ROUND_DURATION_SECONDS", 1),
        patch("app.game.BETWEEN_ROUNDS_SECONDS", 0),
    ):
        client = TestClient(app)
        with client.websocket_connect("/ws/host") as host:
            room = host.receive_json()
            code = room["room_code"]
            with client.websocket_connect(
                f"/ws/play/{code}?nickname=Bob"
            ) as bob:
                bob.receive_json()
                host.receive_json()

                host.send_json(
                    {"type": "start_game", "custom_questions": custom}
                )

                round_start = host.receive_json()
                assert round_start["type"] == "round_start"
                assert round_start["total_rounds"] == 2
                assert round_start["question"] == custom[0]["text"]
                assert "African or European?" in round_start["options"]
                bob.receive_json()

                bob.send_json({
                    "type": "submit_answer",
                    "choice": "African or European?",
                    "response_time_ms": 100,
                })

                # Round 1 ends, round 2 starts.
                host.receive_json()  # round_end
                bob.receive_json()
                r2_start = host.receive_json()
                assert r2_start["type"] == "round_start"
                assert r2_start["question"] == custom[1]["text"]
                bob.receive_json()
                bob.send_json({
                    "type": "submit_answer",
                    "choice": "this one",
                    "response_time_ms": 100,
                })
                host.receive_json()  # round_end
                bob.receive_json()

                # Game over after the second custom question.
                game_over = host.receive_json()
                assert game_over["type"] == "game_over"
                assert game_over["leaderboard"][0]["nickname"] == "Bob"
                assert game_over["leaderboard"][0]["score"] > 0

        # And total_rounds in the DB was rewritten to match the custom pack.
        db = SessionLocal()
        try:
            game_row = db.get(Game, room["game_id"])
            assert game_row is not None
            assert game_row.total_rounds == 2
        finally:
            db.close()
