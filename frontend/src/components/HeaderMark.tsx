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

  const mark = (
    <span
      className="block flicker-slow"
      style={{
        filter:
          'drop-shadow(0 0 4px rgba(255,179,71,0.85)) drop-shadow(0 0 12px rgba(255,179,71,0.45))',
        lineHeight: 0,
      }}
      aria-hidden
    >
      <svg
        width="36"
        height="36"
        viewBox="0 0 64 64"
        xmlns="http://www.w3.org/2000/svg"
      >
        {bulbs.map(({ cx, cy, key }) => (
          <circle
            key={key}
            cx={cx}
            cy={cy}
            r="2.4"
            fill="var(--color-chalk, #e8dbb8)"
          />
        ))}
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fontFamily="var(--font-shade, 'Bungee Shade'), system-ui, sans-serif"
          fontSize="34"
          fontWeight="700"
          fill="var(--color-amber, #ffb347)"
        >
          ?
        </text>
      </svg>
    </span>
  )

  // On the home page, render as a non-link decorative mark; everywhere else,
  // link back to the menu.
  if (isHome) {
    return (
      <div
        className="fixed top-2 left-1/2 z-40 -translate-x-1/2 select-none"
        aria-label="The Regulars Club"
      >
        {mark}
      </div>
    )
  }

  return (
    <Link
      to="/"
      className="fixed top-2 left-1/2 z-40 -translate-x-1/2 select-none"
      aria-label="Back to the menu"
    >
      {mark}
    </Link>
  )
}
