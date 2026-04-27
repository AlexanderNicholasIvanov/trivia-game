import { useSyncExternalStore } from 'react'
import { audio } from '../audio'

function getSnapshot(): boolean {
  return audio.isMuted()
}

export default function MuteToggle() {
  const muted = useSyncExternalStore(
    (cb) => audio.subscribe(cb),
    getSnapshot,
    getSnapshot,
  )

  return (
    <button
      type="button"
      aria-label={muted ? 'Unmute room ambience' : 'Mute room ambience'}
      aria-pressed={!muted}
      onClick={() => {
        // Clicking the toggle also counts as a user gesture, so unlock the
        // audio context if the page hasn't done it elsewhere yet.
        audio.unlock()
        audio.setMuted(!muted)
      }}
      className="group fixed top-3 right-3 z-50 select-none"
      style={{
        background: 'transparent',
        border: 'none',
        padding: '6px 10px',
        cursor: 'pointer',
      }}
    >
      <span
        className="font-mono text-[10px] uppercase tracking-[0.4em] opacity-70 group-hover:opacity-100 transition-opacity"
        style={{
          color: muted
            ? 'var(--color-paper-dim)'
            : 'var(--color-amber)',
          textShadow: muted
            ? 'none'
            : '0 0 6px rgba(255,179,71,0.6), 0 0 14px rgba(255,179,71,0.3)',
        }}
      >
        {muted ? '◌ silence' : '♪ on air'}
      </span>
    </button>
  )
}
