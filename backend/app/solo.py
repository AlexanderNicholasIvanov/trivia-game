"""REST endpoints for single-player mode.

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

from app.database import SessionLocal
from app.models import Question


router = APIRouter(prefix="/api/solo", tags=["solo"])


class SoloQuestion(BaseModel):
    id: int
    text: str
    options: list[str]
    correct_answer: str
    category: str
    difficulty: str


class SoloQuestionsResponse(BaseModel):
    questions: list[SoloQuestion]


@router.get("/questions", response_model=SoloQuestionsResponse)
def get_solo_questions(
    count: int = Query(default=10, ge=1, le=25),
) -> SoloQuestionsResponse:
    """Return `count` random questions with options shuffled."""
    db = SessionLocal()
    try:
        all_ids = [row[0] for row in db.query(Question.id).all()]
        if len(all_ids) < count:
            raise HTTPException(
                status_code=503,
                detail=f"Not enough questions in bank (have {len(all_ids)}, need {count})",
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
