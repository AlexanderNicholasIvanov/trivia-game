import { create } from 'zustand'
import type { GamePhase, PlayerInfo } from './types'

type RoundState = {
  roundNumber: number
  totalRounds: number
  question: string
  options: string[]
  durationSeconds: number
  startedAt: number // ms since epoch, for computing response_time
}

type Store = {
  phase: GamePhase
  roomCode: string | null
  gameId: number | null
  selfPlayerId: number | null
  players: PlayerInfo[]
  round: RoundState | null
  lastCorrectAnswer: string | null
  leaderboard: PlayerInfo[]
  error: string | null

  setPhase: (phase: GamePhase) => void
  setRoom: (roomCode: string, gameId: number) => void
  setSelfPlayerId: (id: number) => void
  setPlayers: (players: PlayerInfo[]) => void
  setRound: (round: RoundState) => void
  endRound: (correct: string, leaderboard: PlayerInfo[]) => void
  endGame: (leaderboard: PlayerInfo[]) => void
  setError: (msg: string | null) => void
  reset: () => void
}

const initialState = {
  phase: 'home' as GamePhase,
  roomCode: null,
  gameId: null,
  selfPlayerId: null,
  players: [],
  round: null,
  lastCorrectAnswer: null,
  leaderboard: [],
  error: null,
}

export const useStore = create<Store>((set) => ({
  ...initialState,
  setPhase: (phase) => set({ phase }),
  setRoom: (roomCode, gameId) =>
    set({ roomCode, gameId, phase: 'lobby' }),
  setSelfPlayerId: (id) => set({ selfPlayerId: id }),
  setPlayers: (players) => set({ players }),
  setRound: (round) =>
    set({ round, phase: 'round', lastCorrectAnswer: null }),
  endRound: (correct, leaderboard) =>
    set({
      lastCorrectAnswer: correct,
      leaderboard,
      phase: 'intermission',
    }),
  endGame: (leaderboard) =>
    set({ leaderboard, phase: 'finished' }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}))
