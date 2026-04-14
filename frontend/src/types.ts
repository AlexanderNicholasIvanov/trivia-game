export type PlayerInfo = {
  id: number
  nickname: string
  score: number
}

export type ServerMessage =
  | { type: 'room_created'; room_code: string; game_id: number }
  | { type: 'joined'; player_id: number; room_code: string; players: PlayerInfo[] }
  | { type: 'player_joined'; player: PlayerInfo; players: PlayerInfo[] }
  | { type: 'player_left'; player_id: number; players: PlayerInfo[] }
  | {
      type: 'round_start'
      round_number: number
      total_rounds: number
      question: string
      options: string[]
      duration_seconds: number
    }
  | { type: 'round_end'; correct_answer: string; leaderboard: PlayerInfo[] }
  | { type: 'game_over'; leaderboard: PlayerInfo[] }
  | { type: 'error'; message: string }
  | { type: 'pong' }

export type GamePhase = 'home' | 'lobby' | 'round' | 'intermission' | 'finished'
