"""Game loop: run rounds, score answers, and broadcast state to all clients."""
from __future__ import annotations

import asyncio
import json
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Answer, Game, GameRound, GameStatus, Player, Question
from app.rooms import Room
from app.schemas import (
    CustomQuestionInput,
    ErrorMessage,
    GameOver,
    PlayerInfo,
    RoundEnd,
    RoundStart,
)


logger = logging.getLogger(__name__)


ROUND_DURATION_SECONDS = 15
BETWEEN_ROUNDS_SECONDS = 5
MAX_POINTS = 1000
MIN_POINTS = 500  # floor for a correct answer even if they answered at the buzzer


@dataclass
class _QuestionData:
    """Snapshot of a Question detached from any DB session."""

    id: int
    text: str
    correct_answer: str
    incorrect_answers: list[str]
    is_custom: bool = False


def _pick_questions(
    db: Session,
    count: int,
    categories: list[str] | None = None,
) -> list[_QuestionData]:
    """Pick `count` random questions from the bank, detached from the session.

    When `categories` is provided and non-empty, the pool is restricted
    to those categories. An empty list or None means "any category".
    """
    id_query = db.query(Question.id)
    if categories:
        id_query = id_query.filter(Question.category.in_(categories))
    all_ids = [q.id for q in id_query.all()]
    if len(all_ids) < count:
        scope = "in selected categories" if categories else "in bank"
        raise RuntimeError(
            f"Not enough questions {scope} (need {count}, have {len(all_ids)})"
        )
    chosen_ids = random.sample(all_ids, count)
    rows = db.query(Question).filter(Question.id.in_(chosen_ids)).all()
    return [
        _QuestionData(
            id=q.id,
            text=q.text,
            correct_answer=q.correct_answer,
            incorrect_answers=json.loads(q.incorrect_answers),
        )
        for q in rows
    ]


def _calculate_points(is_correct: bool, response_time_ms: int, duration_ms: int) -> int:
    """Correct answers earn points on a linear scale by speed."""
    if not is_correct:
        return 0
    # Clamp to [0, duration_ms] so a misbehaving client can't escape the range.
    clamped = max(0, min(duration_ms, response_time_ms))
    ratio = 1.0 - (clamped / duration_ms)
    return int(MIN_POINTS + ratio * (MAX_POINTS - MIN_POINTS))


def _leaderboard(room: Room) -> list[PlayerInfo]:
    sorted_players = sorted(
        room.players.values(), key=lambda p: p.score, reverse=True
    )
    return [PlayerInfo(id=p.id, nickname=p.nickname, score=p.score) for p in sorted_players]


async def run_game(
    room: Room,
    categories: list[str] | None = None,
    custom_questions: list[CustomQuestionInput] | None = None,
) -> None:
    """Run the full game loop for a room. Called after host sends `start_game`.

    When `custom_questions` is provided, those are used directly (length is
    capped at 25) and `categories` is ignored. Otherwise the bank is sampled
    with the optional `categories` filter applied.
    """
    try:
        # If the host sent a custom pack, that drives the round count.
        custom_count = (
            min(25, len(custom_questions)) if custom_questions else None
        )

        # Mark IN_PROGRESS and decide on the round count.
        with SessionLocal() as db:
            game = db.get(Game, room.game_id)
            if game is None:
                return
            game.status = GameStatus.IN_PROGRESS
            if custom_count is not None:
                game.total_rounds = custom_count
            total_rounds = game.total_rounds
            db.commit()

        # Build the question set up front.
        if custom_questions:
            questions = [
                _QuestionData(
                    id=-(i + 1),
                    text=q.text,
                    correct_answer=q.correct_answer,
                    incorrect_answers=list(q.incorrect_answers),
                    is_custom=True,
                )
                for i, q in enumerate(custom_questions[:total_rounds])
            ]
        else:
            with SessionLocal() as db:
                questions = _pick_questions(db, total_rounds, categories)

        for round_number, question in enumerate(questions, start=1):
            await _run_single_round(room, room.game_id, question, round_number, total_rounds)
            if round_number < total_rounds:
                await asyncio.sleep(BETWEEN_ROUNDS_SECONDS)

        with SessionLocal() as db:
            game = db.get(Game, room.game_id)
            if game is not None:
                game.status = GameStatus.FINISHED
                db.commit()

        await room.broadcast(GameOver(leaderboard=_leaderboard(room)).model_dump())
    except asyncio.CancelledError:
        # Host disconnected (or room closed) — abort silently.
        raise
    except Exception:
        logger.exception("Game loop crashed for room %s", room.code)
        # Best effort: mark the game finished and notify clients so they don't hang.
        try:
            with SessionLocal() as db:
                game = db.get(Game, room.game_id)
                if game is not None:
                    game.status = GameStatus.FINISHED
                    db.commit()
        except Exception:
            logger.exception("Failed to mark game %s as finished after crash", room.game_id)
        try:
            await room.broadcast(
                ErrorMessage(message="The game ended unexpectedly.").model_dump()
            )
            await room.broadcast(GameOver(leaderboard=_leaderboard(room)).model_dump())
        except Exception:
            logger.exception("Failed to broadcast game-over after crash for room %s", room.code)
        # Don't re-raise: we've notified clients and recorded the failure.


async def _run_single_round(
    room: Room,
    game_id: int,
    question: _QuestionData,
    round_number: int,
    total_rounds: int,
) -> None:
    duration_ms = ROUND_DURATION_SECONDS * 1000

    # Custom questions don't have a row in `questions`, so we can't write a
    # GameRound for them (FK violation). Skip the round-level DB writes when
    # the question is custom; we still update the game's current_round so
    # external monitors see progress.
    round_id: int | None = None
    if not question.is_custom:
        with SessionLocal() as db:
            game_round = GameRound(
                game_id=game_id,
                question_id=question.id,
                round_number=round_number,
                started_at=datetime.now(timezone.utc),
            )
            db.add(game_round)
            game = db.get(Game, game_id)
            if game is not None:
                game.current_round = round_number
            db.commit()
            db.refresh(game_round)
            round_id = game_round.id
    else:
        with SessionLocal() as db:
            game = db.get(Game, game_id)
            if game is not None:
                game.current_round = round_number
                db.commit()

    # Prep options (correct + incorrect, shuffled)
    options = [question.correct_answer, *question.incorrect_answers]
    random.shuffle(options)

    # Track live answers keyed by player_id. For custom rounds where there's
    # no GameRound row, use a synthetic id (negative round_number) so the
    # `current_round_id is None` guard in the WS handler keeps working.
    room.current_round_id = round_id if round_id is not None else -round_number
    room.current_answers = {}

    # Broadcast round start
    await room.broadcast(
        RoundStart(
            round_number=round_number,
            total_rounds=total_rounds,
            question=question.text,
            options=options,
            duration_seconds=ROUND_DURATION_SECONDS,
        ).model_dump()
    )

    # Wait for all players to answer, or until the timer runs out
    loop = asyncio.get_running_loop()
    start = loop.time()
    while loop.time() - start < ROUND_DURATION_SECONDS:
        if room.players and len(room.current_answers) >= len(room.players):
            break
        await asyncio.sleep(0.2)

    # Persist answers + scores in a fresh session. Custom rounds skip the
    # Answer rows (no parent GameRound) but still update the live player
    # scores in the DB so the leaderboard endures.
    with SessionLocal() as db:
        for player_id, (choice, response_time_ms) in room.current_answers.items():
            is_correct = choice == question.correct_answer
            points = _calculate_points(is_correct, response_time_ms, duration_ms)

            if round_id is not None:
                answer = Answer(
                    round_id=round_id,
                    player_id=player_id,
                    choice=choice,
                    is_correct=is_correct,
                    response_time_ms=response_time_ms,
                    points_awarded=points,
                )
                db.add(answer)

            live_player = room.players.get(player_id)
            if live_player:
                live_player.score += points

            db_player = db.get(Player, player_id)
            if db_player:
                db_player.score = live_player.score if live_player else db_player.score + points

        if round_id is not None:
            round_row = db.get(GameRound, round_id)
            if round_row is not None:
                round_row.ended_at = datetime.now(timezone.utc)
        db.commit()

    # Clear round state
    room.current_round_id = None
    room.current_answers = {}

    # Broadcast round end
    await room.broadcast(
        RoundEnd(
            correct_answer=question.correct_answer,
            leaderboard=_leaderboard(room),
        ).model_dump()
    )
