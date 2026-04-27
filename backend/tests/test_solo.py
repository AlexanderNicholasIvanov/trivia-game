"""Tests for the single-player REST endpoint."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_solo_questions_default_count() -> None:
    client = TestClient(app)
    resp = client.get("/api/solo/questions")
    assert resp.status_code == 200
    data = resp.json()
    assert "questions" in data
    assert len(data["questions"]) == 10
    q = data["questions"][0]
    assert {"id", "text", "options", "correct_answer", "category", "difficulty"} <= q.keys()
    assert len(q["options"]) == 4
    assert q["correct_answer"] in q["options"]


def test_solo_questions_custom_count() -> None:
    client = TestClient(app)
    resp = client.get("/api/solo/questions?count=5")
    assert resp.status_code == 200
    assert len(resp.json()["questions"]) == 5


def test_solo_questions_count_out_of_range() -> None:
    client = TestClient(app)
    assert client.get("/api/solo/questions?count=0").status_code == 422
    assert client.get("/api/solo/questions?count=26").status_code == 422
