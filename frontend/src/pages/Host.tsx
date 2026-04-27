import { useEffect, useRef, useState } from 'react'
import { audio } from '../audio'
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
    error,
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

    const unsubClose = socket.onClose(() => {
      if (!useStore.getState().error) {
        setError('Connection lost. The bar is empty.')
      }
    })

    socket.connect().then(() => setConnected(true)).catch(console.error)

    return () => {
      unsub()
      unsubClose()
      socket.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Duck the room ambience while a question is on screen.
  useEffect(() => {
    if (phase === 'round') audio.setDuck(0.3)
    else audio.setDuck(1)
    return () => {
      audio.setDuck(1)
    }
  }, [phase])

  const startGame = () => {
    socketRef.current?.send({ type: 'start_game' })
  }

  if (error) {
    return (
      <StageFrame>
        <div className="flex h-full items-center justify-center">
          <div className="chalk text-2xl tracking-[0.3em] uppercase flicker neon-text-pink">
            {error}
          </div>
        </div>
      </StageFrame>
    )
  }

  if (!connected || !roomCode) {
    return (
      <StageFrame>
        <div className="flex h-full items-center justify-center">
          <div className="chalk text-2xl tracking-[0.3em] uppercase flicker">
            tuning in&hellip;
          </div>
        </div>
      </StageFrame>
    )
  }

  if (phase === 'lobby') {
    return <LobbyScreen roomCode={roomCode} players={players} onStart={startGame} />
  }

  if (phase === 'round' && round) {
    return <RoundScreen round={round} />
  }

  if (phase === 'intermission' && lastCorrectAnswer) {
    return (
      <IntermissionScreen
        correctAnswer={lastCorrectAnswer}
        leaderboard={leaderboard}
      />
    )
  }

  if (phase === 'finished') {
    return <FinalScreen leaderboard={leaderboard} />
  }

  return (
    <StageFrame>
      <div className="chalk text-2xl">Loading&hellip;</div>
    </StageFrame>
  )
}

function StageFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,179,71,0.12), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(255,61,127,0.08), transparent 60%)',
        }}
      />
      <div className="relative z-10 min-h-screen px-10 py-10">{children}</div>
    </div>
  )
}

function LobbyScreen({
  roomCode,
  players,
  onStart,
}: {
  roomCode: string
  players: { id: number; nickname: string; score: number }[]
  onStart: () => void
}) {
  return (
    <StageFrame>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col">
        {/* Top sign */}
        <div className="relative mb-8 flex items-center justify-between">
          <div
            className="flex items-center gap-3 font-mono text-xs uppercase tracking-[0.45em] text-[color:var(--color-paper-dim)]"
          >
            <span
              className="inline-block h-2 w-2 rounded-full pulse-amber"
              style={{
                backgroundColor: 'var(--color-neon)',
                boxShadow:
                  '0 0 8px rgba(255,61,127,0.9), 0 0 20px rgba(255,61,127,0.5)',
              }}
            />
            <span>on air</span>
          </div>
          <div className="chalk text-sm uppercase tracking-[0.35em]">
            Trivia Night &mdash; Lobby
          </div>
        </div>

        {/* Marquee room code */}
        <div className="relative mx-auto w-full max-w-4xl text-center">
          <p className="font-mono text-sm uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)] mb-4">
            tonight's room
          </p>
          <div className="bulb-frame inline-block px-14 py-8 rise">
            <div
              className="neon-text-amber flicker-slow tracking-[0.25em]"
              style={{
                fontFamily: 'var(--font-shade)',
                fontSize: 'clamp(6rem, 16vw, 14rem)',
                lineHeight: 0.9,
              }}
            >
              {roomCode}
            </div>
          </div>
          <p className="mt-8 text-[color:var(--color-paper-dim)] italic text-lg">
            Open the door at{' '}
            <span
              className="neon-text-pink not-italic"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {typeof window !== 'undefined' ? window.location.host : ''}
            </span>
          </p>
        </div>

        {/* Regulars board */}
        <div className="mt-12 flex-1">
          <div className="mb-4 flex items-baseline justify-between">
            <h2
              className="text-2xl tracking-[0.2em] uppercase neon-text-bulb"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              The Regulars
            </h2>
            <span className="font-mono text-sm text-[color:var(--color-paper-dim)]">
              {players.length.toString().padStart(2, '0')} checked in
            </span>
          </div>

          <div className="relative min-h-[180px] rounded-sm surface-felt neon-box-felt px-8 py-8">
            {players.length === 0 ? (
              <div className="flex h-[180px] items-center justify-center">
                <p className="chalk text-2xl italic flicker-slow">
                  waiting for the door to open&hellip;
                </p>
              </div>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {players.map((p, i) => (
                  <li
                    key={p.id}
                    className="chalk text-2xl swing-in"
                    style={{
                      animationDelay: `${i * 80}ms`,
                      transform: `rotate(${((i * 37) % 5) - 2}deg)`,
                    }}
                  >
                    <span>{p.nickname}</span>
                    <span className="mx-3 text-[color:var(--color-paper-dim)]">
                      &middot;
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Start button */}
        <div className="mt-10 flex justify-center">
          <button
            disabled={players.length === 0}
            onClick={onStart}
            className="group relative overflow-hidden rounded-sm px-14 py-6 transition-all disabled:opacity-30 disabled:cursor-not-allowed active:translate-y-[2px]"
            style={{ backgroundColor: 'var(--color-ink-soft)' }}
          >
            <span className="pointer-events-none absolute inset-0 neon-box-pink group-enabled:pulse-amber" />
            <span
              className="relative neon-text-pink text-3xl tracking-[0.3em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              RAISE THE CURTAIN
            </span>
          </button>
        </div>
      </div>
    </StageFrame>
  )
}

function RoundScreen({
  round,
}: {
  round: NonNullable<ReturnType<typeof useStore.getState>['round']>
}) {
  const [timeLeft, setTimeLeft] = useState(round.durationSeconds)

  useEffect(() => {
    let lastTickSecond = -1
    const tick = () => {
      const elapsed = (Date.now() - round.startedAt) / 1000
      const seconds = Math.max(
        0,
        Math.ceil(round.durationSeconds - elapsed),
      )
      setTimeLeft(seconds)
      if (seconds !== lastTickSecond) {
        lastTickSecond = seconds
        if (seconds > 0 && seconds <= 5) audio.tick()
      }
    }
    tick()
    const interval = setInterval(tick, 200)
    return () => clearInterval(interval)
  }, [round])

  const urgent = timeLeft <= 5

  return (
    <StageFrame>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div
            className="font-mono text-xs uppercase tracking-[0.45em] text-[color:var(--color-paper-dim)]"
          >
            Round{' '}
            <span className="neon-text-amber">
              {String(round.roundNumber).padStart(2, '0')}
            </span>{' '}
            / {String(round.totalRounds).padStart(2, '0')}
          </div>
          <TimerSegment seconds={timeLeft} urgent={urgent} />
        </div>

        {/* Parchment question */}
        <div
          className="surface-paper relative mx-auto mb-10 w-full max-w-5xl rounded-sm px-12 py-10 rise"
          style={{
            boxShadow:
              '0 30px 60px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(0,0,0,0.3)',
            transform: 'rotate(-0.4deg)',
          }}
        >
          <div className="absolute -top-3 left-6 bg-[color:var(--color-neon)] px-3 py-1 text-[color:var(--color-paper)]"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '0.75rem',
              letterSpacing: '0.2em',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            QUESTION
          </div>
          <p
            className="text-center leading-[1.1]"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(2rem, 4vw, 3.5rem)',
              fontWeight: 600,
            }}
          >
            {round.question}
          </p>
        </div>

        {/* Options */}
        <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-2 gap-5">
          {round.options.map((opt, i) => (
            <div
              key={i}
              className="relative flex items-center rounded-sm px-8 py-6 rise"
              style={{
                backgroundColor: OPTION_COLORS[i % 4].bg,
                color: OPTION_COLORS[i % 4].fg,
                animationDelay: `${0.2 + i * 0.08}s`,
                boxShadow:
                  '0 10px 30px -6px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              <span
                className="mr-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  backgroundColor: 'rgba(0,0,0,0.3)',
                  color: OPTION_COLORS[i % 4].badge,
                  border: `2px solid ${OPTION_COLORS[i % 4].badge}`,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span
                className="text-xl md:text-2xl leading-tight"
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 600,
                }}
              >
                {opt}
              </span>
            </div>
          ))}
        </div>
      </div>
    </StageFrame>
  )
}

function IntermissionScreen({
  correctAnswer,
  leaderboard,
}: {
  correctAnswer: string
  leaderboard: { id: number; nickname: string; score: number }[]
}) {
  return (
    <StageFrame>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)] mb-6">
          and the answer was
        </p>
        <div
          className="surface-paper inline-block rounded-sm px-12 py-8 stamp"
          style={{
            boxShadow: '0 30px 60px -10px rgba(0,0,0,0.6)',
          }}
        >
          <div
            className="text-center"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(2.5rem, 5vw, 4.5rem)',
              fontWeight: 900,
              lineHeight: 1.05,
              color: 'var(--color-felt)',
            }}
          >
            {correctAnswer}
          </div>
        </div>

        <div className="mt-14 w-full max-w-2xl">
          <h3
            className="mb-4 text-center text-xl tracking-[0.35em] uppercase neon-text-bulb"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Standings
          </h3>
          <Leaderboard rows={leaderboard} />
        </div>
      </div>
    </StageFrame>
  )
}

function FinalScreen({
  leaderboard,
}: {
  leaderboard: { id: number; nickname: string; score: number }[]
}) {
  const winner = leaderboard[0]
  return (
    <StageFrame>
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)] mb-4">
          that's last call
        </p>
        <h1
          className="mb-2 text-center flicker"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(5rem, 14vw, 10rem)',
            lineHeight: 0.9,
          }}
        >
          <span className="neon-text-amber">CLOSING</span>
          <br />
          <span className="neon-text-pink">TIME</span>
        </h1>

        {winner && (
          <div className="mt-6 mb-10 text-center rise">
            <p className="chalk text-lg uppercase tracking-[0.35em]">
              tonight's champion
            </p>
            <p
              className="mt-2 text-5xl md:text-6xl neon-text-amber"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {winner.nickname}
            </p>
            <p
              className="mt-1 text-3xl text-[color:var(--color-paper-dim)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {winner.score.toLocaleString()} pts
            </p>
          </div>
        )}

        <Leaderboard rows={leaderboard} podium />
      </div>
    </StageFrame>
  )
}

function Leaderboard({
  rows,
  podium,
}: {
  rows: { id: number; nickname: string; score: number }[]
  podium?: boolean
}) {
  return (
    <ol className="w-full space-y-2">
      {rows.map((p, i) => {
        const rank = i + 1
        const isFirst = rank === 1
        return (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-sm px-5 py-3 rise"
            style={{
              animationDelay: `${i * 70}ms`,
              backgroundColor: isFirst
                ? 'rgba(255, 179, 71, 0.12)'
                : 'rgba(243, 234, 210, 0.04)',
              border: isFirst
                ? '1px solid rgba(255, 179, 71, 0.5)'
                : '1px solid rgba(232, 219, 184, 0.15)',
              boxShadow: isFirst
                ? '0 0 20px rgba(255,179,71,0.25), inset 0 0 0 1px rgba(255,179,71,0.1)'
                : 'none',
            }}
          >
            <div className="flex items-center gap-4">
              <span
                className={
                  isFirst
                    ? 'neon-text-amber'
                    : 'text-[color:var(--color-paper-dim)]'
                }
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: podium ? '1.5rem' : '1.1rem',
                  fontWeight: 700,
                  minWidth: '2.5rem',
                }}
              >
                {String(rank).padStart(2, '0')}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontSize: podium ? '1.6rem' : '1.2rem',
                  fontWeight: isFirst ? 900 : 600,
                }}
              >
                {p.nickname}
              </span>
            </div>
            <span
              className={isFirst ? 'neon-text-amber' : ''}
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: podium ? '1.6rem' : '1.2rem',
                fontWeight: 700,
                color: isFirst ? undefined : 'var(--color-paper)',
              }}
            >
              {p.score.toLocaleString()}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function TimerSegment({ seconds, urgent }: { seconds: number; urgent: boolean }) {
  const display = String(seconds).padStart(2, '0')
  return (
    <div
      className={`relative rounded-sm px-6 py-3 ${urgent ? 'pulse-amber' : ''}`}
      style={{
        backgroundColor: 'var(--color-ink-soft)',
        border: '2px solid',
        borderColor: urgent ? 'var(--color-neon)' : 'var(--color-amber)',
        boxShadow: urgent
          ? '0 0 20px rgba(255,61,127,0.5), inset 0 0 12px rgba(255,61,127,0.1)'
          : '0 0 20px rgba(255,179,71,0.3), inset 0 0 12px rgba(255,179,71,0.1)',
      }}
    >
      <span
        className={urgent ? 'neon-text-pink' : 'neon-text-amber'}
        style={{
          fontFamily: 'var(--font-mono)',
          fontWeight: 700,
          fontSize: '2.25rem',
          letterSpacing: '0.1em',
          lineHeight: 1,
        }}
      >
        {display}
      </span>
      <span className="ml-1 font-mono text-xs uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)]">
        sec
      </span>
    </div>
  )
}

const OPTION_COLORS = [
  { bg: '#6b1e2f', fg: '#f3ead2', badge: '#ffb347' },
  { bg: '#173024', fg: '#f3ead2', badge: '#ffb347' },
  { bg: '#2a2439', fg: '#f3ead2', badge: '#ff3d7f' },
  { bg: '#3a2008', fg: '#f3ead2', badge: '#ffb347' },
]
