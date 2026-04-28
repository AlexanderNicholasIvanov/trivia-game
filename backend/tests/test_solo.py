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


def test_categories_endpoint_returns_distinct_categories() -> None:
    client = TestClient(app)
    resp = client.get("/api/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert "categories" in data
    assert len(data["categories"]) >= 1
    cat = data["categories"][0]
    assert {"name", "count"} <= cat.keys()
    assert cat["count"] >= 1


def test_solo_questions_filters_by_category() -> None:
    client = TestClient(app)
    cats = client.get("/api/categories").json()["categories"]
    target = cats[0]["name"]
    # Ask for fewer questions than exist in the target category.
    n = min(3, cats[0]["count"])
    resp = client.get(f"/api/solo/questions?count={n}&categories={target}")
    assert resp.status_code == 200
    questions = resp.json()["questions"]
    assert len(questions) == n
    for q in questions:
        assert q["category"] == target


def test_solo_questions_unknown_category_returns_503() -> None:
    client = TestClient(app)
    resp = client.get("/api/solo/questions?count=1&categories=not-a-real-category")
    assert resp.status_code == 503
