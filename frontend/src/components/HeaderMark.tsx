import { Link, useLocation } from 'react-router-dom'

/**
 * Small bulb-bordered question-mark badge that lives at the top of every
 * page. Doubles as a link back to the home menu. Echoes the marquee /
 * bulb-frame aesthetic used on the lobby and home screens.
 */
export default function HeaderMark() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  // Twelve bulbs evenly spaced around a circle.
  const bulbs = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180 - Math.PI / 2
    const cx = 32 + 26 * Math.cos(angle)
    const cy = 32 + 26 * Math.sin(angle)
    return { cx, cy, key: i }
  })

  const SIZE = 48

  const mark = (
    <span
      className="relative block flicker-slow"
      style={{ width: SIZE, height: SIZE, lineHeight: 0 }}
      aria-hidden
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter:
            'drop-shadow(0 0 4px rgba(255,243,196,0.6)) drop-shadow(0 0 10px rgba(255,179,71,0.35))',
        }}
      >
        {bulbs.map(({ cx, cy, key }) => (
          <circle key={key} cx={cx} cy={cy} r="2.6" fill="#e8dbb8" />
        ))}
      </svg>
      <span
        className="neon-text-amber absolute inset-0 flex items-center justify-center"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.6rem',
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1,
          paddingBottom: '2px', // optical centering for "?" cap height
        }}
      >
        ?
      </span>
    </span>
  )

  // On the home page the giant flanking question marks already do the
  // brand work — skip the corner badge entirely.
  if (isHome) return null

  return (
    <Link
      to="/"
      className="absolute top-2 left-1/2 z-40 -translate-x-1/2 select-none"
      aria-label="Back to the menu"
    >
      {mark}
    </Link>
  )
}
