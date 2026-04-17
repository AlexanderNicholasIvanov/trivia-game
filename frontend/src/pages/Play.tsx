import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { TriviaSocket } from '../ws'
import type { ServerMessage } from '../types'

export default function Play() {
  const { roomCode } = useParams<{ roomCode: string }>()
  const [search] = useSearchParams()
  const nickname = search.get('nickname') ?? ''

  const socketRef = useRef<TriviaSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [submittedChoice, setSubmittedChoice] = useState<string | null>(null)

  const {
    phase,
    players,
    round,
    lastCorrectAnswer,
    leaderboard,
    selfPlayerId,
    error,
    setRoom,
    setSelfPlayerId,
    setPlayers,
    setRound,
    endRound,
    endGame,
    setError,
    reset,
  } = useStore()

  useEffect(() => {
    if (!roomCode || !nickname) return
    reset()
    const socket = new TriviaSocket(
      `/ws/play/${roomCode}?nickname=${encodeURIComponent(nickname)}`,
    )
    socketRef.current = socket

    const unsub = socket.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'joined':
          setRoom(msg.room_code, 0)
          setSelfPlayerId(msg.player_id)
          setPlayers(msg.players)
          break
        case 'player_joined':
        case 'player_left':
          setPlayers(msg.players)
          break
        case 'round_start':
          setSubmittedChoice(null)
          setRound({
            roundNumber: msg.round_number,
            totalRounds: msg.total_rounds,
            question: msg.question,
            options: msg.options,
            durationSeconds: msg.duration_seconds,
            startedAt: Date.now(),
          })
          break
        case 'round_end':
          endRound(msg.correct_answer, msg.leaderboard)
          break
        case 'game_over':
          endGame(msg.leaderboard)
          break
        case 'host_left':
          setError('Host ended the game.')
          break
        case 'error':
          setError(msg.message)
          break
      }
    })

    socket.connect().then(() => setConnected(true)).catch(console.error)

    return () => {
      unsub()
      socket.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, nickname])

  const submitAnswer = (choice: string) => {
    if (submittedChoice || !round) return
    const responseTime = Date.now() - round.startedAt
    setSubmittedChoice(choice)
    socketRef.current?.send({
      type: 'submit_answer',
      choice,
      response_time_ms: responseTime,
    })
  }

  if (!roomCode || !nickname) {
    return <CenteredMessage>Missing room code or nickname.</CenteredMessage>
  }

  if (error) {
    return <CenteredMessage>{error}</CenteredMessage>
  }

  if (!connected) {
    return <CenteredMessage>Connecting...</CenteredMessage>
  }

  const selfPlayer = players.find((p) => p.id === selfPlayerId)

  if (phase === 'lobby') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-center">
        <p className="text-slate-400 mb-2">You're in!</p>
        <h1 className="text-4xl font-bold mb-6">{nickname}</h1>
        <div className="text-slate-500 mb-4">Room</div>
        <div className="text-5xl font-mono tracking-widest mb-10">{roomCode}</div>
        <p className="text-slate-400">Waiting for host to start the game...</p>
        <p className="text-slate-600 mt-8 text-sm">
          {players.length} player{players.length === 1 ? '' : 's'} in the room
        </p>
      </div>
    )
  }

  if (phase === 'round' && round) {
    return (
      <div className="min-h-screen p-4 flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="flex justify-between text-sm text-slate-400 mb-4">
          <span>{nickname}</span>
          <span>
            Round {round.roundNumber}/{round.totalRounds}
          </span>
        </div>

        {submittedChoice ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="text-2xl font-semibold text-slate-300 mb-3">
              Answer locked in!
            </div>
            <p className="text-slate-400">{submittedChoice}</p>
            <p className="text-slate-500 mt-8 text-sm">Waiting for other players...</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center gap-3">
            {round.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => submitAnswer(opt)}
                className={`${colorFor(i)} rounded-2xl p-6 text-xl font-semibold text-white active:scale-95 transition`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (phase === 'intermission' && lastCorrectAnswer) {
    const myRank = leaderboard.findIndex((p) => p.id === selfPlayerId)
    const wasCorrect = submittedChoice === lastCorrectAnswer
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-center">
        <div
          className={`text-5xl font-black mb-8 ${
            wasCorrect ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {wasCorrect ? 'Correct!' : 'Nope.'}
        </div>
        <p className="text-slate-400 mb-1">The answer was</p>
        <p className="text-2xl font-bold mb-10">{lastCorrectAnswer}</p>
        <div className="text-slate-400 mb-1">Your score</div>
        <div className="text-5xl font-mono text-pink-300 mb-6">
          {selfPlayer?.score ?? 0}
        </div>
        {myRank >= 0 && (
          <p className="text-slate-400">
            Rank: #{myRank + 1} of {leaderboard.length}
          </p>
        )}
      </div>
    )
  }

  if (phase === 'finished') {
    const myRank = leaderboard.findIndex((p) => p.id === selfPlayerId)
    const me = leaderboard[myRank]
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-center">
        <h1 className="text-5xl font-black mb-6 bg-gradient-to-r from-amber-300 to-pink-400 bg-clip-text text-transparent">
          Game Over
        </h1>
        <p className="text-slate-400 mb-1">You finished</p>
        <div className="text-6xl font-black mb-4">#{myRank + 1}</div>
        <p className="text-slate-400 mb-1">with</p>
        <div className="text-4xl font-mono text-pink-300">{me?.score ?? 0} pts</div>
      </div>
    )
  }

  return <CenteredMessage>Loading...</CenteredMessage>
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-400 text-xl p-6 text-center">
      {children}
    </div>
  )
}

function colorFor(i: number): string {
  return [
    'bg-rose-600 hover:bg-rose-500',
    'bg-blue-600 hover:bg-blue-500',
    'bg-emerald-600 hover:bg-emerald-500',
    'bg-amber-600 hover:bg-amber-500',
  ][i % 4]
}
