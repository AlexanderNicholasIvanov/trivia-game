import { useEffect, useState } from 'react'

type Category = { name: string; count: number }

export default function CategoryPicker({
  selected,
  onChange,
  className = '',
}: {
  selected: string[]
  onChange: (categories: string[]) => void
  className?: string
}) {
  const [categories, setCategories] = useState<Category[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/categories')
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text().catch(() => r.statusText))
        return r.json() as Promise<{ categories: Category[] }>
      })
      .then((data) => {
        if (!cancelled) setCategories(data.categories)
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <p
        className={`text-center italic text-[color:var(--color-paper-dim)] ${className}`}
      >
        Couldn't load the menu: {error}
      </p>
    )
  }
  if (!categories) {
    return (
      <p
        className={`text-center chalk text-sm tracking-[0.3em] uppercase flicker-slow ${className}`}
      >
        reading the menu&hellip;
      </p>
    )
  }

  const toggle = (name: string) => {
    if (selected.includes(name)) {
      onChange(selected.filter((c) => c !== name))
    } else {
      onChange([...selected, name])
    }
  }

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <div className="flex flex-wrap justify-center gap-2">
        {categories.map(({ name, count }) => {
          const isSelected = selected.includes(name)
          return (
            <button
              type="button"
              key={name}
              onClick={() => toggle(name)}
              className="rounded-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] transition"
              style={{
                backgroundColor: isSelected
                  ? 'rgba(255,179,71,0.18)'
                  : 'rgba(232, 219, 184, 0.04)',
                color: isSelected
                  ? 'var(--color-amber)'
                  : 'var(--color-paper-dim)',
                border: isSelected
                  ? '1px solid rgba(255,179,71,0.6)'
                  : '1px solid rgba(232, 219, 184, 0.12)',
                boxShadow: isSelected
                  ? '0 0 10px rgba(255,179,71,0.25)'
                  : 'none',
                textShadow: isSelected
                  ? '0 0 6px rgba(255,179,71,0.5)'
                  : 'none',
              }}
            >
              {name}
              <span className="ml-2 opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {selected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="chalk text-xs uppercase tracking-[0.3em] flicker-slow"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          ← clear · play across the whole menu
        </button>
      )}

      {selected.length === 0 && (
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-paper-dim)] opacity-70">
          pick none to mix every category
        </p>
      )}
    </div>
  )
}
