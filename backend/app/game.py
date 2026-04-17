"""Game loop: run rounds, score answers, and broadcast state to all clients."""
from __future__ import annotations

import asyncio
import json
import random
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Answer, Game, GameRound, GameStatus, Player, Question
from app.rooms import Room
from app.schemas import GameOver, PlayerInfo, RoundEnd, RoundStart


ROUND_DURATION_SECONDS = 15
BETWEEN_ROUNDS_SECONDS = 5
MAX_POINTS = 1000
MIN_POINTS = 500  # floor for a correct answer even if they answered at the buzzer


def _pick_questions(db: Session, count: int) -> list[Question]:
    """Pick `count` random questions from the bank."""
    # Simple random sample — fine for small bank.
    all_ids = [q.id for q in db.query(Question.id).all()]
    if len(all_ids) < count:
        raise RuntimeError(f"Not enough questions in bank (need {count}, have {len(all_ids)})")
    chosen_ids = random.sample(all_ids, count)
    return db.query(Question).filter(Question.id.in_(chosen_ids)).all()


def _calculate_points(is_correct: bool, response_time_ms: int, duration_ms: int) -> int:
    """Correct answers earn points on a linear scale by speed."""
    if not is_correct:
        return 0
    # Ratio of remaining time (1.0 = instant, 0.0 = at the buzzer)
    ratio = max(0.0, 1.0 - (response_time_ms / duration_ms))
    return int(MIN_POINTS + ratio * (MAX_POINTS - MIN_POINTS))


def _leaderboard(room: Room) -> list[PlayerInfo]:
    sorted_players = sorted(
        room.players.values(), key=lambda p: p.score, reverse=True
    )
    return [PlayerInfo(id=p.id, nickname=p.nickname, score=p.score) for p in sorted_players]


async def run_game(room: Room) -> None:
    """Run the full game loop for a room. Called after host sends `start_game`."""
    db = SessionLocal()
    try:
        game = db.get(Game, room.game_id)
        if game is None:
            return
        game.status = GameStatus.IN_PROGRESS
        db.commit()

        questions = _pick_questions(db, game.total_rounds)

        for round_number, question in enumerate(questions, start=1):
            await _run_single_round(db, room, game, question, round_number)
            # Brief intermission between rounds, unless it's the last.
            if round_number < game.total_rounds:
                await asyncio.sleep(BETWEEN_ROUNDS_SECONDS)

        # Game over
        game.status = GameStatus.FINISHED
        db.commit()
        await room.broadcast(GameOver(leaderboard=_leaderboard(room)).model_dump())
    except asyncio.CancelledError:
        # Host disconnected (or room closed) — abort silently.
        raise
    finally:
        db.close()


async def _run_single_round(
    db: Session,
    room: Room,
    game: Game,
    question: Question,
    round_number: int,
) -> None:
    # Persist the round record
    game_round = GameRound(
        game_id=game.id,
        question_id=question.id,
        round_number=round_number,
        started_at=datetime.now(timezone.utc),
    )
    db.add(game_round)
    db.commit()
    db.refresh(game_round)

    # Prep options (correct + incorrect, shuffled)
    options = [question.correct_answer, *json.loads(question.incorrect_answers)]
    random.shuffle(options)

    duration_ms = ROUND_DURATION_SECONDS * 1000

    # Track live answers keyed by player_id
    room.current_round_id = game_round.id
    room.current_answers = {}

    # Broadcast round start
    await room.broadcast(
        RoundStart(
            round_number=round_number,
            total_rounds=game.total_rounds,
            question=question.text,
            options=options,
            duration_seconds=ROUND_DURATION_SECONDS,
        ).model_dump()
    )

    # Wait for all players to answer, or until the timer runs out
    start = asyncio.get_event_loop().time()
    while asyncio.get_event_loop().time() - start < ROUND_DURATION_SECONDS:
        if room.players and len(room.current_answers) >= len(room.players):
            break
        await asyncio.sleep(0.2)

    # Persist answers + scores
    for player_id, (choice, response_time_ms) in room.current_answers.items():
        is_correct = choice == question.correct_answer
        points = _calculate_points(is_correct, response_time_ms, duration_ms)

        answer = Answer(
            round_id=game_round.id,
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
            db_player.score = (live_player.score if live_player else db_player.score + points)

    game_round.ended_at = datetime.now(timezone.utc)
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
