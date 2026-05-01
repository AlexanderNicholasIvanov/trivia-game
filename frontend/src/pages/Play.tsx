import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { audio } from '../audio'
import { useStore } from '../store'
import { TriviaSocket } from '../ws'
import type { ServerMessage } from '../types'

export default function Play() {
  const navigate = useNavigate()
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
          setError('The host closed the bar.')
          break
        case 'error':
          setError(msg.message)
          break
      }
    })

    const unsubClose = socket.onClose(() => {
      if (!useStore.getState().error) {
        setError('Connection lost. Refresh to try again.')
      }
    })

    socket.connect().then(() => setConnected(true)).catch(console.error)

    return () => {
      unsub()
      unsubClose()
      socket.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, nickname])

  // Duck the room ambience while a question is on screen.
  useEffect(() => {
    if (phase === 'round') audio.setDuck(0.3)
    else audio.setDuck(1)
    return () => {
      audio.setDuck(1)
    }
  }, [phase])

  // Reveal SFX: when the round ends, play correct/wrong based on local choice.
  const prevCorrectAnswerRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lastCorrectAnswer) return
    if (lastCorrectAnswer === prevCorrectAnswerRef.current) return
    prevCorrectAnswerRef.current = lastCorrectAnswer
    if (submittedChoice && submittedChoice === lastCorrectAnswer) {
      audio.correct()
    } else {
      audio.wrong()
    }
  }, [lastCorrectAnswer, submittedChoice])

  const submitAnswer = (choice: string) => {
    if (submittedChoice || !round) return
    const responseTime = Date.now() - round.startedAt
    setSubmittedChoice(choice)
    audio.lock()
    socketRef.current?.send({
      type: 'submit_answer',
      choice,
      response_time_ms: responseTime,
    })
  }

  if (!roomCode || !nickname) {
    return <Centered kicker="missing info">No room or name supplied.</Centered>
  }
  if (error) {
    return (
      <Centered kicker="tough break">
        <span className="neon-text-pink">{error}</span>
      </Centered>
    )
  }
  if (!connected) {
    return <Centered kicker="connecting">Hold tight&hellip;</Centered>
  }

  const selfPlayer = players.find((p) => p.id === selfPlayerId)

  if (phase === 'lobby') {
    return (
      <PlayerLobby
        nickname={nickname}
        roomCode={roomCode}
        count={players.length}
        onLeave={() => navigate('/')}
      />
    )
  }

  if (phase === 'round' && round) {
    return (
      <RoundView
        round={round}
        nickname={nickname}
        submittedChoice={submittedChoice}
        onSubmit={submitAnswer}
      />
    )
  }

  if (phase === 'intermission' && lastCorrectAnswer) {
    const myRank = leaderboard.findIndex((p) => p.id === selfPlayerId)
    const wasCorrect = submittedChoice === lastCorrectAnswer
    return (
      <IntermissionView
        wasCorrect={wasCorrect}
        correctAnswer={lastCorrectAnswer}
        score={selfPlayer?.score ?? 0}
        rank={myRank >= 0 ? myRank + 1 : null}
        totalPlayers={leaderboard.length}
      />
    )
  }

  if (phase === 'finished') {
    const myRank = leaderboard.findIndex((p) => p.id === selfPlayerId)
    const me = myRank >= 0 ? leaderboard[myRank] : undefined
    return (
      <FinalView
        rank={myRank >= 0 ? myRank + 1 : null}
        score={me?.score ?? 0}
        total={leaderboard.length}
      />
    )
  }

  return <Centered kicker="huh">Still loading&hellip;</Centered>
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden px-5 py-8 flex flex-col">
      {children}
    </div>
  )
}

function TopTag({
  nickname,
  right,
}: {
  nickname: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: 'var(--color-neon)',
            boxShadow:
              '0 0 6px rgba(214, 69, 47,0.9), 0 0 14px rgba(214, 69, 47,0.5)',
          }}
        />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.35em] text-[color:var(--color-paper-dim)]"
        >
          {nickname}
        </span>
      </div>
      {right}
    </div>
  )
}

function PlayerLobby({
  nickname,
  roomCode,
  count,
  onLeave,
}: {
  nickname: string
  roomCode: string
  count: number
  onLeave: () => void
}) {
  return (
    <Frame>
      <button
        type="button"
        onClick={onLeave}
        className="fixed top-3 left-3 z-50 chalk text-xs uppercase tracking-[0.4em] flicker-slow"
        style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        aria-label="Leave the room and return home"
      >
        ← back to the bar
      </button>
      <TopTag nickname={nickname} />

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="chalk text-sm uppercase tracking-[0.4em] mb-3 flicker-slow">
          you're on the list
        </p>
        <h1
          className="neon-text-amber flicker mb-6"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(3rem, 18vw, 5rem)',
            lineHeight: 0.9,
          }}
        >
          HELLO,
        </h1>
        <p
          className="mb-10 neon-text-pink"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(1.75rem, 7vw, 2.5rem)',
            letterSpacing: '0.05em',
          }}
        >
          {nickname.toUpperCase()}
        </p>

        <div className="mb-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)] mb-2">
            your table
          </p>
          <p
            className="neon-text-amber"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '3rem',
              letterSpacing: '0.3em',
              fontWeight: 700,
            }}
          >
            {roomCode}
          </p>
        </div>

        <p className="chalk text-lg italic mb-1 flicker-slow">
          the quizmaster is pouring drinks&hellip;
        </p>
        <p className="font-mono text-xs text-[color:var(--color-paper-dim)] tracking-[0.2em] uppercase">
          {count} {count === 1 ? 'person' : 'people'} in tonight
        </p>
      </div>
    </Frame>
  )
}

function RoundView({
  round,
  nickname,
  submittedChoice,
  onSubmit,
}: {
  round: NonNullable<ReturnType<typeof useStore.getState>['round']>
  nickname: string
  submittedChoice: string | null
  onSubmit: (choice: string) => void
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

  if (submittedChoice) {
    return (
      <Frame>
        <TopTag
          nickname={nickname}
          right={
            <span
              className="font-mono text-xs tracking-[0.3em] uppercase text-[color:var(--color-paper-dim)]"
            >
              R{round.roundNumber}/{round.totalRounds}
            </span>
          }
        />
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <p className="chalk text-sm uppercase tracking-[0.4em] mb-4">
            locked in
          </p>
          <h2
            className="neon-text-pink flicker-slow mb-8"
            style={{
              fontFamily: 'var(--font-shade)',
              fontSize: 'clamp(3rem, 16vw, 5rem)',
              lineHeight: 0.9,
            }}
          >
            ✓
          </h2>
          <div
            className="surface-paper rounded-sm px-6 py-4 mb-10 max-w-sm"
            style={{
              boxShadow: '0 12px 28px -6px rgba(0,0,0,0.5)',
              transform: 'rotate(-1deg)',
            }}
          >
            <p
              className="text-xl leading-tight"
              style={{
                fontFamily: 'var(--font-serif)',
                fontWeight: 700,
                color: 'var(--color-felt)',
              }}
            >
              {submittedChoice}
            </p>
          </div>
          <p className="chalk italic flicker-slow">
            watching the others sweat&hellip;
          </p>
        </div>
      </Frame>
    )
  }

  return (
    <Frame>
      <TopTag
        nickname={nickname}
        right={
          <span
            className="font-mono text-xs tracking-[0.3em] uppercase text-[color:var(--color-paper-dim)]"
          >
            R{round.roundNumber}/{round.totalRounds}
          </span>
        }
      />

      {/* Timer bar */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-1">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)]"
          >
            time left
          </span>
          <span
            className={urgent ? 'neon-text-pink' : 'neon-text-amber'}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '1.5rem',
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {String(timeLeft).padStart(2, '0')}
          </span>
        </div>
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ backgroundColor: 'rgba(232, 219, 184, 0.1)' }}
        >
          <div
            className="h-full transition-[width] duration-300 ease-linear"
            style={{
              width: `${
                round.durationSeconds > 0
                  ? (timeLeft / round.durationSeconds) * 100
                  : 0
              }%`,
              backgroundColor: urgent
                ? 'var(--color-neon)'
                : 'var(--color-amber)',
              boxShadow: urgent
                ? '0 0 10px rgba(214, 69, 47,0.7)'
                : '0 0 10px rgba(255,179,71,0.7)',
            }}
          />
        </div>
      </div>

      {/* Question on paper */}
      <div
        className="surface-paper relative rounded-sm px-5 py-5 mb-5 rise"
        style={{
          boxShadow: '0 20px 40px -10px rgba(0,0,0,0.5)',
          transform: 'rotate(-0.3deg)',
        }}
      >
        <p
          className="leading-tight text-center"
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 'clamp(1.1rem, 5vw, 1.5rem)',
            fontWeight: 600,
            color: 'var(--color-ink)',
          }}
        >
          {round.question}
        </p>
      </div>

      {/* Buzzers */}
      <div className="grid flex-1 grid-cols-1 gap-3 content-stretch">
        {round.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onSubmit(opt)}
            className="group relative overflow-hidden rounded-sm px-5 py-4 text-left active:translate-y-[2px] active:scale-[0.99] transition-transform rise"
            style={{
              animationDelay: `${0.1 + i * 0.06}s`,
              backgroundColor: BUZZER_COLORS[i % 4].bg,
              boxShadow: `0 8px 0 ${BUZZER_COLORS[i % 4].shadow}, 0 12px 30px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)`,
              border: `1px solid ${BUZZER_COLORS[i % 4].border}`,
            }}
          >
            <div className="flex items-center gap-4">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.25rem',
                  backgroundColor: 'rgba(0,0,0,0.4)',
                  color: BUZZER_COLORS[i % 4].badge,
                  border: `2px solid ${BUZZER_COLORS[i % 4].badge}`,
                }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <span
                className="flex-1 text-lg leading-tight"
                style={{
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 600,
                  color: 'var(--color-paper)',
                }}
              >
                {opt}
              </span>
            </div>
          </button>
        ))}
      </div>
    </Frame>
  )
}

function IntermissionView({
  wasCorrect,
  correctAnswer,
  score,
  rank,
  totalPlayers,
}: {
  wasCorrect: boolean
  correctAnswer: string
  score: number
  rank: number | null
  totalPlayers: number
}) {
  return (
    <Frame>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p
          className={`mb-4 ${wasCorrect ? 'neon-text-amber' : 'neon-text-pink'} flicker`}
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(4rem, 20vw, 6.5rem)',
            lineHeight: 0.9,
          }}
        >
          {wasCorrect ? 'NICE' : 'OOF'}
        </p>
        <p className="chalk text-sm uppercase tracking-[0.35em] mb-2">
          the answer was
        </p>
        <div
          className="surface-paper rounded-sm px-6 py-4 mb-10 max-w-sm stamp"
          style={{
            boxShadow: '0 12px 28px -6px rgba(0,0,0,0.5)',
          }}
        >
          <p
            className="text-2xl leading-tight"
            style={{
              fontFamily: 'var(--font-serif)',
              fontWeight: 900,
              color: 'var(--color-felt)',
            }}
          >
            {correctAnswer}
          </p>
        </div>

        <div className="flex items-baseline gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[color:var(--color-paper-dim)]">
              score
            </p>
            <p
              className="neon-text-amber"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '2.5rem',
                fontWeight: 700,
              }}
            >
              {score.toLocaleString()}
            </p>
          </div>
          {rank !== null && (
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-[color:var(--color-paper-dim)]">
                rank
              </p>
              <p
                className="neon-text-pink"
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '2.5rem',
                  fontWeight: 700,
                }}
              >
                {rank}
                <span className="text-xl text-[color:var(--color-paper-dim)]">
                  /{totalPlayers}
                </span>
              </p>
            </div>
          )}
        </div>
      </div>
    </Frame>
  )
}

function FinalView({
  rank,
  score,
  total,
}: {
  rank: number | null
  score: number
  total: number
}) {
  const medal =
    rank === 1
      ? 'CHAMPION'
      : rank === 2
      ? 'RUNNER-UP'
      : rank === 3
      ? 'BRONZE'
      : 'THANKS FOR COMING'
  return (
    <Frame>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)] mb-3">
          that's last call
        </p>
        <h1
          className="flicker mb-6"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(3.5rem, 18vw, 5.5rem)',
            lineHeight: 0.9,
          }}
        >
          <span className="neon-text-amber">CLOSING</span>
          <br />
          <span className="neon-text-pink">TIME</span>
        </h1>

        <p className="chalk text-sm uppercase tracking-[0.35em] mb-2">
          you finished
        </p>
        <p
          className="neon-text-amber mb-1"
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '4.5rem',
            lineHeight: 1,
          }}
        >
          {rank !== null ? `#${rank}` : '—'}
        </p>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)] mb-6">
          {rank !== null ? `of ${total}` : 'unranked'}
        </p>

        <div className="mb-8">
          <p
            className="neon-text-pink"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.25rem',
              letterSpacing: '0.25em',
            }}
          >
            {medal}
          </p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)] mb-1">
            final score
          </p>
          <p
            className="neon-text-amber"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '2.5rem',
              fontWeight: 700,
            }}
          >
            {score.toLocaleString()}
          </p>
        </div>
      </div>
    </Frame>
  )
}

function Centered({
  children,
  kicker,
}: {
  children: React.ReactNode
  kicker: string
}) {
  return (
    <Frame>
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)] mb-3">
          {kicker}
        </p>
        <p
          className="text-2xl italic"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {children}
        </p>
      </div>
    </Frame>
  )
}

const BUZZER_COLORS = [
  {
    bg: '#7a2135',
    shadow: '#451020',
    border: '#9a3249',
    badge: '#ffb347',
  },
  {
    bg: '#1e3a2d',
    shadow: '#0d1f18',
    border: '#2a5a44',
    badge: '#ffb347',
  },
  {
    bg: '#2a2439',
    shadow: '#14101c',
    border: '#3d3452',
    badge: '#ff3d7f',
  },
  {
    bg: '#3a2008',
    shadow: '#1d1004',
    border: '#56320f',
    badge: '#ffb347',
  },
]
