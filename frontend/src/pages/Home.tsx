import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

export default function Home() {
  const navigate = useNavigate()
  const [joinCode, setJoinCode] = useState('')
  const [nickname, setNickname] = useState('')

  const canJoin = joinCode.trim().length === 4 && nickname.trim().length > 0

  return (
    <div className="relative min-h-screen overflow-hidden">
      <DecorStars />

      <main className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.35em] text-[color:var(--color-paper-dim)] mb-3 rise" style={{ animationDelay: '0.05s' }}>
          &mdash; every Thursday, 8pm &mdash;
        </p>

        <h1
          className="text-center leading-[0.85] mb-1 rise"
          style={{ animationDelay: '0.15s', fontFamily: 'var(--font-display)' }}
        >
          <span className="block text-6xl neon-text-pink flicker">TRIVIA</span>
          <span className="block text-7xl neon-text-amber flicker-slow">NIGHT</span>
        </h1>

        <p className="mt-6 mb-10 text-center text-lg text-[color:var(--color-paper-dim)] italic rise" style={{ animationDelay: '0.3s' }}>
          Four-letter rooms. Fifteen-second rounds.
          <br />
          Bring your worst friends.
        </p>

        <div className="w-full space-y-8 rise" style={{ animationDelay: '0.45s' }}>
          <button
            onClick={() => navigate('/host')}
            className="group relative block w-full overflow-hidden rounded-sm px-6 py-5 text-center transition-all active:translate-y-[1px]"
            style={{ backgroundColor: 'var(--color-ink-soft)' }}
          >
            <span className="pointer-events-none absolute inset-0 rounded-sm neon-box-amber group-hover:pulse-amber" />
            <span
              className="relative neon-text-amber text-2xl tracking-[0.15em]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              HOST A GAME
            </span>
            <span className="relative mt-1 block font-serif italic text-sm text-[color:var(--color-amber-deep)]">
              free &middot; no signup &middot; live on your TV
            </span>
          </button>

          <ChalkDivider>or join a room</ChalkDivider>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)] font-mono">
                room code
              </span>
              <input
                value={joinCode}
                onChange={(e) =>
                  setJoinCode(e.target.value.toUpperCase().slice(0, 4))
                }
                placeholder="----"
                maxLength={4}
                className="block w-full rounded-sm border-2 border-dashed bg-transparent px-4 py-4 text-center text-5xl font-bold tracking-[0.4em] uppercase outline-none transition focus:border-solid"
                style={{
                  fontFamily: 'var(--font-mono)',
                  borderColor: 'var(--color-brass)',
                  color: 'var(--color-amber)',
                  textShadow:
                    '0 0 6px rgba(255,179,71,0.6), 0 0 14px rgba(255,179,71,0.3)',
                }}
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)] font-mono">
                your name
              </span>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                placeholder="who's asking"
                maxLength={20}
                className="block w-full rounded-sm border bg-[color:var(--color-ink-soft)] px-4 py-3 text-lg italic outline-none transition focus:border-[color:var(--color-neon)]"
                style={{
                  fontFamily: 'var(--font-serif)',
                  borderColor: 'rgba(232, 219, 184, 0.2)',
                  color: 'var(--color-paper)',
                }}
              />
            </label>

            <button
              disabled={!canJoin}
              onClick={() =>
                navigate(
                  `/play/${joinCode.trim().toUpperCase()}?nickname=${encodeURIComponent(nickname.trim())}`,
                )
              }
              className="group relative block w-full overflow-hidden rounded-sm px-6 py-4 text-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:translate-y-[1px]"
              style={{ backgroundColor: 'var(--color-ink-soft)' }}
            >
              <span className="pointer-events-none absolute inset-0 rounded-sm neon-box-pink group-enabled:group-hover:brightness-125 transition" />
              <span
                className="relative neon-text-pink text-xl tracking-[0.18em]"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                STEP INSIDE
              </span>
            </button>
          </div>

          <button
            onClick={() => navigate('/solo')}
            className="group mt-6 flex w-full items-center justify-center gap-3 chalk text-sm uppercase tracking-[0.35em] flicker-slow"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <span aria-hidden className="opacity-60">—</span>
            no friends tonight? play solo →
            <span aria-hidden className="opacity-60">—</span>
          </button>
        </div>

        <div className="mt-16 flex items-center gap-3 text-[color:var(--color-paper-dim)] rise" style={{ animationDelay: '0.8s' }}>
          <BulbDot />
          <span className="font-mono text-[10px] uppercase tracking-[0.4em]">
            est. right now
          </span>
          <BulbDot />
        </div>
      </main>
    </div>
  )
}

function ChalkDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[color:var(--color-paper-dim)]">
      <span className="h-px flex-1 bg-[color:var(--color-paper-dim)] opacity-30" />
      <span className="chalk text-sm uppercase tracking-[0.2em]">
        {children}
      </span>
      <span className="h-px flex-1 bg-[color:var(--color-paper-dim)] opacity-30" />
    </div>
  )
}

function BulbDot() {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{
        backgroundColor: 'var(--color-chalk)',
        boxShadow:
          '0 0 6px rgba(255, 243, 196, 0.9), 0 0 14px rgba(255, 179, 71, 0.6)',
      }}
    />
  )
}

function DecorStars() {
  return (
    <>
      <span
        className="pointer-events-none absolute top-[12%] left-[8%] text-4xl flicker"
        style={{
          color: 'var(--color-amber)',
          textShadow:
            '0 0 10px rgba(255,179,71,0.9), 0 0 24px rgba(255,179,71,0.5)',
        }}
      >
        ✦
      </span>
      <span
        className="pointer-events-none absolute top-[22%] right-[12%] text-2xl flicker-slow"
        style={{
          color: 'var(--color-neon)',
          textShadow:
            '0 0 8px rgba(255,61,127,0.9), 0 0 18px rgba(255,61,127,0.5)',
        }}
      >
        ✶
      </span>
      <span
        className="pointer-events-none absolute bottom-[14%] left-[14%] text-3xl flicker-slow"
        style={{
          color: 'var(--color-chalk)',
          textShadow: '0 0 10px rgba(255,243,196,0.8)',
        }}
      >
        ✷
      </span>
      <span
        className="pointer-events-none absolute bottom-[20%] right-[8%] text-xl flicker"
        style={{
          color: 'var(--color-amber)',
          textShadow:
            '0 0 8px rgba(255,179,71,0.9), 0 0 18px rgba(255,179,71,0.5)',
        }}
      >
        ✦
      </span>
    </>
  )
}
