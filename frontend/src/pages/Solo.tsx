import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { audio } from '../audio'
import CategoryPicker from '../components/CategoryPicker'

const ROUND_DURATION_SECONDS = 15
const REVEAL_SECONDS = 3
const MIN_POINTS = 500
const MAX_POINTS = 1000
const BEST_KEY = 'theregulars-club:solo-best'

type SoloQuestion = {
  id: number
  text: string
  options: string[]
  correct_answer: string
  category: string
  difficulty: string
}

type Phase = 'setup' | 'loading' | 'round' | 'reveal' | 'final' | 'error'

type Best = { score: number; accuracy: number; date: string } | null

function readBest(): Best {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeBest(b: NonNullable<Best>): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b))
  } catch {
    /* ignore quota / private mode */
  }
}

function calculatePoints(responseMs: number, durationMs: number): number {
  const clamped = Math.max(0, Math.min(durationMs, responseMs))
  const ratio = 1 - clamped / durationMs
  return Math.round(MIN_POINTS + ratio * (MAX_POINTS - MIN_POINTS))
}

export default function Solo() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [questions, setQuestions] = useState<SoloQuestion[]>([])
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [pointsEarned, setPointsEarned] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const startedAtRef = useRef<number>(0)

  useEffect(() => {
    if (phase !== 'loading') return
    let cancelled = false
    const params = new URLSearchParams({ count: '10' })
    for (const cat of selectedCategories) params.append('categories', cat)
    fetch(`/api/solo/questions?${params}`)
      .then(async (r) => {
        if (!r.ok) {
          const detail = await r
            .json()
            .then((d) => d?.detail ?? r.statusText)
            .catch(() => r.statusText)
          throw new Error(typeof detail === 'string' ? detail : 'Failed to load')
        }
        return r.json() as Promise<{ questions: SoloQuestion[] }>
      })
      .then((data) => {
        if (cancelled) return
        if (!data.questions?.length) {
          setErrorMsg('The deck is empty.')
          setPhase('error')
          return
        }
        setQuestions(data.questions)
        startedAtRef.current = Date.now()
        setPhase('round')
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setPhase('error')
      })
    return () => {
      cancelled = true
    }
  }, [phase, selectedCategories])

  const total = questions.length
  const current = questions[index]

  // Duck the room ambience while a question is on screen so the timer
  // tension lands harder. Restore it on reveal / final.
  useEffect(() => {
    if (phase === 'round') audio.setDuck(0.3)
    else audio.setDuck(1)
    return () => {
      audio.setDuck(1)
    }
  }, [phase])

  const lockAnswer = (choice: string | null) => {
    if (!current || phase !== 'round') return
    const responseMs = Date.now() - startedAtRef.current
    const isCorrect = choice !== null && choice === current.correct_answer
    const pts = isCorrect ? calculatePoints(responseMs, ROUND_DURATION_SECONDS * 1000) : 0
    setChosen(choice)
    setPointsEarned(pts)
    setScore((s) => s + pts)
    setCorrectCount((c) => c + (isCorrect ? 1 : 0))
    setStreak((s) => {
      const next = isCorrect ? s + 1 : 0
      setBestStreak((b) => Math.max(b, next))
      return next
    })
    if (choice !== null) audio.lock()
    if (isCorrect) audio.correct()
    else audio.wrong()
    setPhase('reveal')
  }

  const advance = () => {
    if (index + 1 >= total) {
      setPhase('final')
      return
    }
    setIndex((i) => i + 1)
    setChosen(null)
    setPointsEarned(0)
    startedAtRef.current = Date.now()
    setPhase('round')
  }

  if (phase === 'setup')
    return (
      <SetupScreen
        selected={selectedCategories}
        onChange={setSelectedCategories}
        onBegin={() => setPhase('loading')}
      />
    )
  if (phase === 'loading') return <Loading />
  if (phase === 'error') return <ErrorView message={errorMsg ?? 'Something went sideways.'} />
  if (phase === 'final')
    return (
      <FinalScreen
        score={score}
        correct={correctCount}
        total={total}
        bestStreak={bestStreak}
      />
    )

  if (!current) return <Loading />

  return (
    <RoundFrame
      key={current.id}
      question={current}
      index={index}
      total={total}
      score={score}
      streak={streak}
      phase={phase}
      chosen={chosen}
      pointsEarned={pointsEarned}
      onAnswer={lockAnswer}
      onAdvance={advance}
    />
  )
}

function RoundFrame({
  question,
  index,
  total,
  score,
  streak,
  phase,
  chosen,
  pointsEarned,
  onAnswer,
  onAdvance,
}: {
  question: SoloQuestion
  index: number
  total: number
  score: number
  streak: number
  phase: 'round' | 'reveal'
  chosen: string | null
  pointsEarned: number
  onAnswer: (choice: string | null) => void
  onAdvance: () => void
}) {
  const isReveal = phase === 'reveal'
  const [startedAt] = useState(() => Date.now())
  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION_SECONDS)
  const [revealTimeLeft, setRevealTimeLeft] = useState(REVEAL_SECONDS)
  const onAnswerRef = useRef(onAnswer)
  const onAdvanceRef = useRef(onAdvance)
  const lastTickSecondRef = useRef<number>(-1)

  useEffect(() => {
    onAnswerRef.current = onAnswer
    onAdvanceRef.current = onAdvance
  })

  // Round countdown.
  useEffect(() => {
    if (isReveal) return
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const remaining = Math.max(0, ROUND_DURATION_SECONDS - elapsed)
      const seconds = Math.ceil(remaining)
      setTimeLeft(seconds)
      if (seconds !== lastTickSecondRef.current) {
        lastTickSecondRef.current = seconds
        if (seconds > 0 && seconds <= 5) audio.tick()
      }
      if (remaining <= 0) {
        onAnswerRef.current(null)
      }
    }
    const interval = setInterval(tick, 200)
    return () => clearInterval(interval)
  }, [isReveal, startedAt])

  // Reveal countdown auto-advance.
  useEffect(() => {
    if (!isReveal) return
    let elapsed = 0
    const interval = setInterval(() => {
      elapsed += 1
      const remaining = Math.max(0, REVEAL_SECONDS - elapsed)
      setRevealTimeLeft(remaining)
      if (remaining <= 0) {
        clearInterval(interval)
        onAdvanceRef.current()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [isReveal])

  const urgent = !isReveal && timeLeft <= 5

  return (
    <Stage>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-3xl flex-col px-5 py-6">
        {/* Mode header lockup */}
        <div className="mb-5 flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span
              className="font-mono text-[9px] uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)]"
            >
              vs. the house
            </span>
            <span
              className="neon-text-amber flicker-slow"
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '1.1rem',
                letterSpacing: '0.18em',
                lineHeight: 1,
              }}
            >
              FLY SOLO
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="font-mono text-[9px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)]">
              round
            </span>
            <span
              className="neon-text-pink"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.1rem',
                fontWeight: 700,
                letterSpacing: '0.1em',
                lineHeight: 1,
              }}
            >
              {String(index + 1).padStart(2, '0')}
              <span className="text-[color:var(--color-paper-dim)] opacity-50 mx-0.5">
                /
              </span>
              {String(total).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Brass rule under header */}
        <div
          className="mb-6 h-px w-full"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent, rgba(193,154,73,0.55) 18%, rgba(193,154,73,0.55) 82%, transparent)',
          }}
        />

        {/* Score & streak strip */}
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)]">
              score
            </p>
            <p
              className="neon-text-amber"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.75rem',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {score.toLocaleString()}
            </p>
          </div>
          {streak >= 2 && (
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)]">
                streak
              </p>
              <p
                className="neon-text-pink"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '1.5rem',
                  letterSpacing: '0.1em',
                }}
              >
                ×{streak}
              </p>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)]">
              {isReveal ? 'next in' : 'time left'}
            </span>
            <span
              className={
                isReveal
                  ? 'neon-text-bulb'
                  : urgent
                    ? 'neon-text-pink'
                    : 'neon-text-amber'
              }
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '1.25rem',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {String(isReveal ? revealTimeLeft : timeLeft).padStart(2, '0')}
            </span>
          </div>
          <div
            className="h-1 w-full overflow-hidden rounded-full"
            style={{ backgroundColor: 'rgba(232, 219, 184, 0.1)' }}
          >
            <div
              className="h-full transition-[width] duration-300 ease-linear"
              style={{
                width: isReveal
                  ? `${(revealTimeLeft / REVEAL_SECONDS) * 100}%`
                  : `${(timeLeft / ROUND_DURATION_SECONDS) * 100}%`,
                backgroundColor: isReveal
                  ? 'var(--color-chalk)'
                  : urgent
                    ? 'var(--color-neon)'
                    : 'var(--color-amber)',
                boxShadow: isReveal
                  ? '0 0 8px rgba(255,243,196,0.5)'
                  : urgent
                    ? '0 0 10px rgba(214, 69, 47,0.7)'
                    : '0 0 10px rgba(255,179,71,0.7)',
              }}
            />
          </div>
        </div>

        {/* Question card */}
        <div
          className="surface-paper relative rounded-sm px-6 py-6 mb-6 rise"
          style={{
            boxShadow: '0 24px 50px -12px rgba(0,0,0,0.55)',
            transform: 'rotate(-0.3deg)',
          }}
        >
          <div
            className="absolute -top-3 left-5 px-3 py-1"
            style={{
              backgroundColor: 'var(--color-neon)',
              color: 'var(--color-paper)',
              fontFamily: 'var(--font-display)',
              fontSize: '0.65rem',
              letterSpacing: '0.25em',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            {question.category.toUpperCase()}
          </div>
          <p
            className="leading-tight text-center"
            style={{
              fontFamily: 'var(--font-serif)',
              fontSize: 'clamp(1.15rem, 4.5vw, 1.6rem)',
              fontWeight: 600,
              color: 'var(--color-ink)',
            }}
          >
            {question.text}
          </p>
        </div>

        {/* Options */}
        <div className="grid flex-1 grid-cols-1 gap-3 content-stretch">
          {question.options.map((opt, i) => {
            const isCorrect = opt === question.correct_answer
            const isChosen = opt === chosen
            const palette = BUZZER_COLORS[i % 4]
            let state: 'idle' | 'right' | 'wrong' | 'dim' = 'idle'
            if (isReveal) {
              if (isCorrect) state = 'right'
              else if (isChosen) state = 'wrong'
              else state = 'dim'
            }
            return (
              <button
                key={`${question.id}-${i}`}
                onClick={() => !isReveal && onAnswer(opt)}
                disabled={isReveal}
                className="group relative overflow-hidden rounded-sm px-5 py-4 text-left transition-all rise"
                style={{
                  animationDelay: `${0.1 + i * 0.06}s`,
                  backgroundColor:
                    state === 'right'
                      ? '#1f3a2a'
                      : state === 'wrong'
                        ? '#3a1422'
                        : palette.bg,
                  opacity: state === 'dim' ? 0.4 : 1,
                  boxShadow:
                    state === 'right'
                      ? '0 0 0 2px var(--color-amber), 0 0 26px rgba(255,179,71,0.6), 0 8px 0 #0d1f18'
                      : state === 'wrong'
                        ? '0 0 0 2px var(--color-neon), 0 0 22px rgba(214, 69, 47,0.55), 0 8px 0 #1d0a14'
                        : `0 8px 0 ${palette.shadow}, 0 12px 30px -8px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.2)`,
                  border:
                    state === 'right'
                      ? '1px solid var(--color-amber)'
                      : state === 'wrong'
                        ? '1px solid var(--color-neon)'
                        : `1px solid ${palette.border}`,
                  transform:
                    !isReveal && isChosen ? 'translateY(2px) scale(0.99)' : undefined,
                  cursor: isReveal ? 'default' : 'pointer',
                }}
              >
                <div className="flex items-center gap-4">
                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '1.25rem',
                      backgroundColor: 'rgba(0,0,0,0.4)',
                      color:
                        state === 'right'
                          ? 'var(--color-amber)'
                          : state === 'wrong'
                            ? 'var(--color-neon)'
                            : palette.badge,
                      border: `2px solid ${
                        state === 'right'
                          ? 'var(--color-amber)'
                          : state === 'wrong'
                            ? 'var(--color-neon)'
                            : palette.badge
                      }`,
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
                  {state === 'right' && (
                    <span
                      className="font-mono text-xs uppercase tracking-[0.25em] neon-text-amber"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {pointsEarned > 0 && isChosen
                        ? `+${pointsEarned}`
                        : 'answer'}
                    </span>
                  )}
                  {state === 'wrong' && isChosen && (
                    <span
                      className="font-mono text-xs uppercase tracking-[0.25em] neon-text-pink"
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      oof
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Skip-reveal */}
        {isReveal && (
          <button
            onClick={onAdvance}
            className="mt-5 chalk text-sm uppercase tracking-[0.4em] flicker-slow self-center"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            next →
          </button>
        )}
      </div>
    </Stage>
  )
}

function FinalScreen({
  score,
  correct,
  total,
  bestStreak,
}: {
  score: number
  correct: number
  total: number
  bestStreak: number
}) {
  const navigate = useNavigate()
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0
  const previousBest = useMemo<Best>(() => readBest(), [])
  const isNewBest = !previousBest || score > previousBest.score

  useEffect(() => {
    if (isNewBest) {
      writeBest({
        score,
        accuracy,
        date: new Date().toISOString(),
      })
    }
  }, [isNewBest, score, accuracy])

  const verdict =
    accuracy === 100
      ? 'PERFECT POUR'
      : accuracy >= 80
        ? 'TOP SHELF'
        : accuracy >= 60
          ? 'WELL DONE'
          : accuracy >= 40
            ? 'STILL DRINKING'
            : 'CLOSE THE TAB'

  return (
    <Stage>
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-2xl flex-col items-center justify-center px-5 py-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-[color:var(--color-paper-dim)] mb-3">
          {isNewBest ? 'a new house record' : 'last call'}
        </p>

        <h1
          className="flicker mb-3"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(3.5rem, 17vw, 6rem)',
            lineHeight: 0.9,
          }}
        >
          <span className="neon-text-amber">{verdict.split(' ')[0]}</span>
          {verdict.split(' ').length > 1 && <br />}
          {verdict.split(' ').length > 1 && (
            <span className="neon-text-pink">
              {verdict.split(' ').slice(1).join(' ')}
            </span>
          )}
        </h1>

        <div className="my-8 flex items-end gap-10 justify-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)]">
              score
            </p>
            <p
              className="neon-text-amber"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(2.5rem, 10vw, 3.75rem)',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {score.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)]">
              right
            </p>
            <p
              className="neon-text-pink"
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 'clamp(2.5rem, 10vw, 3.75rem)',
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {correct}
              <span className="text-[color:var(--color-paper-dim)] text-2xl">
                /{total}
              </span>
            </p>
          </div>
        </div>

        <div className="mb-10 flex flex-col gap-1 text-[color:var(--color-paper-dim)]">
          <p className="font-mono text-xs uppercase tracking-[0.35em]">
            accuracy {accuracy}%
          </p>
          {bestStreak >= 2 && (
            <p className="font-mono text-xs uppercase tracking-[0.35em]">
              best streak ×{bestStreak}
            </p>
          )}
          {previousBest && !isNewBest && (
            <p className="font-mono text-xs uppercase tracking-[0.35em]">
              house record {previousBest.score.toLocaleString()}
            </p>
          )}
          {isNewBest && previousBest && (
            <p className="font-mono text-xs uppercase tracking-[0.35em] neon-text-amber">
              beat your old best of {previousBest.score.toLocaleString()}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-4 w-full max-w-sm">
          <button
            onClick={() => window.location.reload()}
            className="group relative w-full overflow-hidden rounded-sm px-6 py-4 active:translate-y-[1px]"
            style={{ backgroundColor: 'var(--color-ink-soft)' }}
          >
            <span className="pointer-events-none absolute inset-0 rounded-sm neon-box-amber" />
            <span
              className="relative neon-text-amber text-xl tracking-[0.25em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              POUR ANOTHER
            </span>
          </button>
          <button
            onClick={() => navigate('/')}
            className="chalk text-sm uppercase tracking-[0.4em] flicker-slow"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← back to the bar
          </button>
        </div>
      </div>
    </Stage>
  )
}

function SetupScreen({
  selected,
  onChange,
  onBegin,
}: {
  selected: string[]
  onChange: (cats: string[]) => void
  onBegin: () => void
}) {
  return (
    <Stage>
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-5 py-12 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)] mb-3 flicker-slow">
          vs. the house
        </p>
        <h1
          className="neon-text-amber flicker mb-2"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(3rem, 14vw, 5rem)',
            lineHeight: 0.9,
          }}
        >
          FLY SOLO
        </h1>
        <p
          className="text-[color:var(--color-paper-dim)] italic mb-10"
          style={{ fontFamily: 'var(--font-serif)', fontSize: '1.05rem' }}
        >
          ten rounds, fifteen seconds each. pick your poison.
        </p>

        <div className="mb-10 w-full">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[color:var(--color-paper-dim)] mb-4">
            the menu
          </p>
          <CategoryPicker selected={selected} onChange={onChange} />
        </div>

        <button
          type="button"
          onClick={onBegin}
          className="group relative w-full max-w-xs overflow-hidden rounded-sm px-8 py-5 active:translate-y-[1px]"
          style={{ backgroundColor: 'var(--color-ink-soft)' }}
        >
          <span className="pointer-events-none absolute inset-0 rounded-sm neon-box-amber group-hover:pulse-amber" />
          <span
            className="relative neon-text-amber text-2xl tracking-[0.25em]"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            POUR ME ONE
          </span>
        </button>
      </div>
    </Stage>
  )
}

function Loading() {
  // 3 stacked paper "cards" with offsets for a shuffled-deck feel
  return (
    <Stage>
      <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <div
          className="relative mb-10"
          style={{ width: '14rem', height: '9rem' }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="surface-paper absolute inset-0 rise"
              style={{
                animationDelay: `${0.05 + i * 0.12}s`,
                transform: `rotate(${(i - 1) * 4}deg) translateY(${i * 2}px)`,
                boxShadow: '0 12px 30px -8px rgba(0,0,0,0.6)',
                opacity: 1 - i * 0.1,
              }}
            >
              <div
                className="absolute inset-3"
                style={{
                  border: '1px dashed rgba(0,0,0,0.25)',
                }}
              />
              <p
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  fontFamily: 'var(--font-shade)',
                  fontSize: '2.2rem',
                  color: 'var(--color-felt-deep)',
                  letterSpacing: '0.04em',
                }}
              >
                ?
              </p>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.5em] text-[color:var(--color-paper-dim)] mb-2 flicker-slow">
          shuffling the deck
        </p>
        <p
          className="chalk text-2xl italic flicker"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          pouring you a flight&hellip;
        </p>
      </div>
    </Stage>
  )
}

function ErrorView({ message }: { message: string }) {
  return (
    <Stage>
      <div className="flex min-h-screen flex-col items-center justify-center px-5 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.45em] text-[color:var(--color-paper-dim)] mb-3">
          tough break
        </p>
        <p
          className="neon-text-pink mb-6 flicker-slow"
          style={{
            fontFamily: 'var(--font-shade)',
            fontSize: 'clamp(2.5rem, 12vw, 4rem)',
            lineHeight: 0.9,
          }}
        >
          OUT OF QUESTIONS
        </p>
        <p
          className="text-[color:var(--color-paper-dim)] italic mb-8"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          {message}
        </p>
        <Link
          to="/"
          className="chalk text-sm uppercase tracking-[0.4em] flicker-slow"
        >
          ← back to the bar
        </Link>
      </div>
    </Stage>
  )
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,179,71,0.10), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(214, 69, 47,0.08), transparent 60%)',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

const BUZZER_COLORS = [
  { bg: '#7a2135', shadow: '#451020', border: '#9a3249', badge: '#ffb347' },
  { bg: '#1e3a2d', shadow: '#0d1f18', border: '#2a5a44', badge: '#ffb347' },
  { bg: '#2a2439', shadow: '#14101c', border: '#3d3452', badge: '#ff3d7f' },
  { bg: '#3a2008', shadow: '#1d1004', border: '#56320f', badge: '#ffb347' },
]
