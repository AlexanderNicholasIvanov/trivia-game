"""REST endpoints for single-player mode and the shared category list.

Solo play doesn't need the WebSocket coordination or persistence the
multiplayer flow uses — the client fetches a batch of questions, runs
the timer locally, and reports nothing back. Scoring is computed in the
browser using the same formula as the live game loop.
"""
from __future__ import annotations

import json
import random

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func

from app.database import SessionLocal
from app.models import Question


router = APIRouter(prefix="/api", tags=["solo"])


class SoloQuestion(BaseModel):
    id: int
    text: str
    options: list[str]
    correct_answer: str
    category: str
    difficulty: str


class SoloQuestionsResponse(BaseModel):
    questions: list[SoloQuestion]


class CategoryInfo(BaseModel):
    name: str
    count: int


class CategoriesResponse(BaseModel):
    categories: list[CategoryInfo]


def _normalise_categories(raw: list[str] | None) -> list[str] | None:
    """Drop empties and treat ['all'] / [] / None as 'no filter'."""
    if not raw:
        return None
    cleaned = [c.strip() for c in raw if c and c.strip()]
    if not cleaned or cleaned == ["all"]:
        return None
    return cleaned


@router.get("/categories", response_model=CategoriesResponse)
def list_categories() -> CategoriesResponse:
    """Return every category in the question bank with a question count."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Question.category, func.count(Question.id))
            .group_by(Question.category)
            .order_by(Question.category)
            .all()
        )
        return CategoriesResponse(
            categories=[CategoryInfo(name=name, count=n) for name, n in rows]
        )
    finally:
        db.close()


@router.get("/solo/questions", response_model=SoloQuestionsResponse)
def get_solo_questions(
    count: int = Query(default=10, ge=1, le=25),
    categories: list[str] | None = Query(default=None, max_length=32),
) -> SoloQuestionsResponse:
    """Return `count` random questions with options shuffled.

    The optional `categories` query param can be repeated to filter the
    pool to those categories (e.g. `?categories=Geography&categories=History`).
    Repeated params avoid the trap of comma-joining values that may
    themselves contain commas.
    """
    selected = _normalise_categories(categories)
    db = SessionLocal()
    try:
        id_query = db.query(Question.id)
        if selected:
            id_query = id_query.filter(Question.category.in_(selected))
        all_ids = [row[0] for row in id_query.all()]
        if len(all_ids) < count:
            scope = "in selected categories" if selected else "in bank"
            raise HTTPException(
                status_code=503,
                detail=(
                    f"Not enough questions {scope} "
                    f"(have {len(all_ids)}, need {count})"
                ),
            )
        chosen_ids = random.sample(all_ids, count)
        rows = db.query(Question).filter(Question.id.in_(chosen_ids)).all()
        rows_by_id = {r.id: r for r in rows}

        questions: list[SoloQuestion] = []
        for qid in chosen_ids:
            q = rows_by_id[qid]
            options = [q.correct_answer, *json.loads(q.incorrect_answers)]
            random.shuffle(options)
            questions.append(
                SoloQuestion(
                    id=q.id,
                    text=q.text,
                    options=options,
                    correct_answer=q.correct_answer,
                    category=q.category,
                    difficulty=q.difficulty,
                )
            )
        return SoloQuestionsResponse(questions=questions)
    finally:
        db.close()
