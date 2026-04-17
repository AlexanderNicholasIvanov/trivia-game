# Trivia Game

[![CI](https://github.com/AlexanderNicholasIvanov/trivia-game/actions/workflows/ci.yml/badge.svg)](https://github.com/AlexanderNicholasIvanov/trivia-game/actions/workflows/ci.yml)

Real-time multiplayer trivia game. Host creates a room, players join with a code on their phones, questions broadcast live with timed scoring.

## Stack

- **Backend:** FastAPI + WebSockets, SQLAlchemy, Alembic
- **Database:** PostgreSQL 16
- **Frontend:** React + Vite + TypeScript + Tailwind + Zustand
- **Infra (later):** Docker Compose, GitHub Actions

## Development

### Prerequisites

- Python 3.12
- Node 20+
- PostgreSQL 16 running locally

### Run both (recommended)

```bash
./dev.sh
```

Boots the FastAPI backend on `:8000` and the Vite frontend on `:5173`. Creates the venv and installs dependencies on first run. `Ctrl+C` stops both.

### Backend only

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend only

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
trivia-game/
├── backend/        FastAPI app
├── frontend/       React app
└── README.md
```
