"""Seed the question bank from Open Trivia DB.

Run with: python -m app.seed
"""
from __future__ import annotations

import html
import json
import time

import httpx

from app.database import SessionLocal, engine
from app.models import Question


OTDB_URL = "https://opentdb.com/api.php"
BATCHES = 5  # 5 * 50 = 250 questions
BATCH_SIZE = 50


def fetch_batch(amount: int = BATCH_SIZE) -> list[dict]:
    resp = httpx.get(OTDB_URL, params={"amount": amount, "type": "multiple"}, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("response_code") != 0:
        raise RuntimeError(f"Open Trivia DB returned code {data.get('response_code')}")
    return data["results"]


def normalize(raw: dict) -> dict:
    """Decode HTML entities that Open Trivia DB encodes in its text fields."""
    return {
        "category": html.unescape(raw["category"]),
        "difficulty": raw["difficulty"],
        "text": html.unescape(raw["question"]),
        "correct_answer": html.unescape(raw["correct_answer"]),
        "incorrect_answers": json.dumps(
            [html.unescape(a) for a in raw["incorrect_answers"]]
        ),
    }


def seed() -> None:
    session = SessionLocal()
    try:
        existing = session.query(Question).count()
        print(f"Starting with {existing} existing questions")

        total_added = 0
        for i in range(BATCHES):
            print(f"Fetching batch {i + 1}/{BATCHES}...")
            results = fetch_batch()
            for raw in results:
                q = Question(**normalize(raw))
                session.add(q)
            session.commit()
            total_added += len(results)
            # Open Trivia DB rate limits to ~1 req/5s
            if i < BATCHES - 1:
                time.sleep(5.5)

        print(f"Added {total_added} questions. Total now: {session.query(Question).count()}")
    finally:
        session.close()
        engine.dispose()


if __name__ == "__main__":
    seed()
