import { useMemo } from 'react'
import { parseCustomPack } from '../utils/customPack'

const PLACEHOLDER = `# One question per line. Format:
# Question | Correct answer | Wrong | Wrong | Wrong

What did the bartender say to the trombone player? | "Why the long face?" | "Where's your case?" | "Want some peanuts?" | "Sorry, no jam tonight."
The bar opens at what time? | 8 PM | 5 PM | 11 PM | Whenever`

export default function CustomPackInput({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (next: string) => void
  className?: string
}) {
  const { questions, errors } = useMemo(() => parseCustomPack(value), [value])

  return (
    <div className={`flex flex-col gap-3 w-full ${className}`}>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={10}
        spellCheck={false}
        className="w-full rounded-sm border bg-[color:var(--color-ink-soft)] px-4 py-3 outline-none transition focus:border-[color:var(--color-amber)]"
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '0.85rem',
          lineHeight: 1.5,
          color: 'var(--color-paper)',
          borderColor: 'rgba(232, 219, 184, 0.2)',
          resize: 'vertical',
          minHeight: '180px',
        }}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.3em]"
          style={{
            color:
              questions.length > 0
                ? 'var(--color-amber)'
                : 'var(--color-paper-dim)',
          }}
        >
          {questions.length === 0
            ? 'paste your set above'
            : `${questions.length} question${questions.length === 1 ? '' : 's'} ready`}
        </p>
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)] opacity-70">
          format: question | correct | wrong | wrong | wrong
        </p>
      </div>

      {errors.length > 0 && (
        <ul className="rounded-sm border border-[color:rgba(255,61,127,0.4)] bg-[rgba(255,61,127,0.06)] px-3 py-2 font-mono text-[11px] text-[color:var(--color-neon)]">
          {errors.slice(0, 5).map((err, i) => (
            <li key={i}>· {err}</li>
          ))}
          {errors.length > 5 && (
            <li className="opacity-70">· …and {errors.length - 5} more</li>
          )}
        </ul>
      )}
    </div>
  )
}
