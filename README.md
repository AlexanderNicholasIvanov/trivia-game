# Trivia Game

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

### Backend

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

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
