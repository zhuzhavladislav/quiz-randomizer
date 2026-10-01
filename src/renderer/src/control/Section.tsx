import { useState } from 'react'

interface Props {
  /** Ключ для запоминания свёрнутости в localStorage */
  id: string
  title: string
  meta?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

const KEY = 'sections'

function readState(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

/** Сворачиваемый блок настроек; состояние живёт между запусками */
export function Section({ id, title, meta, defaultOpen = true, children }: Props): React.JSX.Element {
  const [open, setOpen] = useState<boolean>(() => readState()[id] ?? defaultOpen)
  const toggle = (): void => {
    const next = !open
    setOpen(next)
    localStorage.setItem(KEY, JSON.stringify({ ...readState(), [id]: next }))
  }
  return (
    <section className={`sec ${open ? 'sec--open' : ''}`}>
      <button type="button" className="sec__head" onClick={toggle} aria-expanded={open}>
        <span className="sec__arrow" aria-hidden="true" />
        <span className="sec__title">{title}</span>
        {meta !== undefined && meta !== null && <span className="sec__meta">{meta}</span>}
      </button>
      {open && <div className="sec__body">{children}</div>}
    </section>
  )
}
