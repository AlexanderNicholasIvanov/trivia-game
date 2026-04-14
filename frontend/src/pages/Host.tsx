import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { TriviaSocket } from '../ws'
import type { ServerMessage } from '../types'

export default function Host() {
  const socketRef = useRef<TriviaSocket | null>(null)
  const [connected, setConnected] = useState(false)

  const {
    phase,
    roomCode,
    players,
    round,
    lastCorrectAnswer,
    leaderboard,
    setRoom,
    setPlayers,
    setRound,
    endRound,
    endGame,
    setError,
    reset,
  } = useStore()

  useEffect(() => {
    reset()
    const socket = new TriviaSocket('/ws/host')
    socketRef.current = socket

    const unsub = socket.onMessage((msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created':
          setRoom(msg.room_code, msg.game_id)
          break
        case 'player_joined':
        case 'player_left':
          setPlayers(msg.players)
          break
        case 'round_start':
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
  }, [])

  const startGame = () => {
    socketRef.current?.send({ type: 'start_game' })
  }

  if (!connected || !roomCode) {
    return <CenteredMessage>Connecting...</CenteredMessage>
  }

  if (phase === 'lobby') {
    return (
      <div className="min-h-screen p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-slate-400 mb-2">Room code</p>
          <div className="text-8xl md:text-9xl font-black tracking-widest font-mono mb-8 bg-gradient-to-r from-pink-400 to-indigo-400 bg-clip-text text-transparent">
            {roomCode}
          </div>
          <p className="text-slate-400 mb-8">
            Players join at <span className="font-mono text-slate-200">localhost:5173</span>
          </p>

          <div className="bg-slate-800/50 rounded-2xl p-6 mb-8 min-h-[200px]">
            <h2 className="text-xl font-semibold mb-4">
              Players ({players.length})
            </h2>
            {players.length === 0 ? (
              <p className="text-slate-500">Waiting for players to join...</p>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                {players.map((p) => (
                  <span
                    key={p.id}
                    className="bg-indigo-600/30 border border-indigo-500/50 rounded-full px-4 py-2 text-sm"
                  >
                    {p.nickname}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button
            disabled={players.length === 0}
            onClick={startGame}
            className="bg-pink-500 hover:bg-pink-400 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-xl font-semibold px-10 py-4 rounded-xl transition"
          >
            Start game
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'round' && round) {
    return <HostRoundView round={round} />
  }

  if (phase === 'intermission' && lastCorrectAnswer) {
    return (
      <IntermissionView
        correctAnswer={lastCorrectAnswer}
        leaderboard={leaderboard}
      />
    )
  }

  if (phase === 'finished') {
    return <FinalLeaderboard leaderboard={leaderboard} />
  }

  return <CenteredMessage>Loading...</CenteredMessage>
}

function HostRoundView({ round }: { round: ReturnType<typeof useStore.getState>['round'] }) {
  const [timeLeft, setTimeLeft] = useState(round?.durationSeconds ?? 0)

  useEffect(() => {
    if (!round) return
    const tick = () => {
      const elapsed = (Date.now() - round.startedAt) / 1000
      setTimeLeft(Math.max(0, Math.ceil(round.durationSeconds - elapsed)))
    }
    tick()
    const interval = setInterval(tick, 250)
    return () => clearInterval(interval)
  }, [round])

  if (!round) return null

  return (
    <div className="min-h-screen p-6 flex flex-col bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="flex justify-between items-center mb-8">
        <span className="text-slate-400 font-semibold">
          Round {round.roundNumber} / {round.totalRounds}
        </span>
        <span className="text-5xl font-black text-pink-400 font-mono">{timeLeft}s</span>
      </div>
      <div className="flex-1 flex flex-col justify-center items-center text-center max-w-4xl mx-auto">
        <p
          className="text-4xl md:text-5xl font-bold mb-12 leading-tight"
          dangerouslySetInnerHTML={{ __html: round.question }}
        />
        <div className="grid grid-cols-2 gap-4 w-full">
          {round.options.map((opt, i) => (
            <div
              key={i}
              className={`${colorFor(i)} rounded-2xl p-6 text-xl font-semibold`}
              dangerouslySetInnerHTML={{ __html: opt }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function IntermissionView({
  correctAnswer,
  leaderboard,
}: {
  correctAnswer: string
  leaderboard: { id: number; nickname: string; score: number }[]
}) {
  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <div className="max-w-3xl mx-auto text-center">
        <p className="text-slate-400 mb-2">The answer was</p>
        <h2
          className="text-5xl font-bold mb-10 text-emerald-400"
          dangerouslySetInnerHTML={{ __html: correctAnswer }}
        />
        <Leaderboard rows={leaderboard} />
      </div>
    </div>
  )
}

function FinalLeaderboard({
  leaderboard,
}: {
  leaderboard: { id: number; nickname: string; score: number }[]
}) {
  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      <h1 className="text-6xl font-black mb-10 bg-gradient-to-r from-amber-300 to-pink-400 bg-clip-text text-transparent">
        Final Scores
      </h1>
      <Leaderboard rows={leaderboard} big />
    </div>
  )
}

function Leaderboard({
  rows,
  big,
}: {
  rows: { id: number; nickname: string; score: number }[]
  big?: boolean
}) {
  return (
    <div className="w-full max-w-xl mx-auto space-y-2">
      {rows.map((p, i) => (
        <div
          key={p.id}
          className={`flex justify-between items-center bg-slate-800/60 border border-slate-700 rounded-xl px-5 py-3 ${
            i === 0 ? 'border-amber-400/50 bg-amber-400/10' : ''
          }`}
        >
          <span className={`${big ? 'text-2xl' : 'text-lg'} font-semibold`}>
            {i + 1}. {p.nickname}
          </span>
          <span className={`${big ? 'text-2xl' : 'text-lg'} font-mono text-pink-300`}>
            {p.score}
          </span>
        </div>
      ))}
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center text-slate-400 text-xl">
      {children}
    </div>
  )
}

function colorFor(i: number): string {
  return [
    'bg-rose-600/80 border-rose-400',
    'bg-blue-600/80 border-blue-400',
    'bg-emerald-600/80 border-emerald-400',
    'bg-amber-600/80 border-amber-400',
  ][i % 4]
}
