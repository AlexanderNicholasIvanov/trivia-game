"""Shared test fixtures."""
from __future__ import annotations

import json

import pytest

from app.database import SessionLocal
from app.models import Question


@pytest.fixture(autouse=True)
def _seed_questions() -> None:
    """Ensure the question bank has enough rows for any game-loop test.

    Tests run against a freshly migrated DB in CI (no seed step). Without
    questions, `_pick_questions` raises and the game loop terminates; the
    happy-path test would then hang waiting for messages.
    """
    db = SessionLocal()
    try:
        if db.query(Question).count() >= 10:
            return
        for i in range(10):
            db.add(
                Question(
                    category="Test",
                    difficulty="easy",
                    text=f"Test question {i + 1}?",
                    correct_answer=f"Right {i + 1}",
                    incorrect_answers=json.dumps(
                        [f"Wrong A{i + 1}", f"Wrong B{i + 1}", f"Wrong C{i + 1}"]
                    ),
                )
            )
        db.commit()
    finally:
        db.close()
