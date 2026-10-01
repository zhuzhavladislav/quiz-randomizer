import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_FONTS, type Theme } from '@shared/theme'
import { useT } from '../shared/lang'

interface FontData {
  family: string
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<FontData[]>
  }
}

/** Список системных семейств; запрашивается один раз (первый вызов может занять несколько секунд) */
let systemFontsCache: string[] | null = null
let systemFontsPromise: Promise<string[]> | null = null
export function loadSystemFonts(): Promise<string[]> {
  if (systemFontsCache) return Promise.resolve(systemFontsCache)
  if (!systemFontsPromise) {
    systemFontsPromise = (async () => {
      try {
        const list = window.queryLocalFonts ? await window.queryLocalFonts() : []
        const families = [...new Set(list.map((f) => f.family))].sort((a, b) => a.localeCompare(b))
        systemFontsCache = families
        return families
      } catch (e) {
        console.error('Не удалось получить список шрифтов:', e)
        systemFontsCache = []
        return []
      }
    })()
  }
  return systemFontsPromise
}

interface Props {
  theme: Theme
  onChange: (patch: Partial<Theme>) => void
}

/** Выбор шрифта: поиск по системным шрифтам с предпросмотром, встроенный Montserrat, файл шрифта */
export function FontPicker({ theme, onChange }: Props): React.JSX.Element {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [fonts, setFonts] = useState<string[] | null>(systemFontsCache)
  const [active, setActive] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || fonts) return
    void loadSystemFonts().then(setFonts)
  }, [open, fonts])

  // Закрытие по клику вне и по Esc
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  const current =
    theme.fontKind === 'builtin'
      ? (BUILTIN_FONTS.find((f) => f.id === theme.fontId)?.label ?? 'Montserrat')
      : theme.fontKind === 'file'
        ? theme.fontName || t('font.fileDefault')
        : theme.fontId || t('font.systemDefault')

  const q = query.trim().toLowerCase()
  const items = useMemo(() => {
    const builtin = BUILTIN_FONTS.filter((f) => !q || f.label.toLowerCase().includes(q)).map((f) => ({
      key: `b:${f.id}`,
      label: f.label,
      family: f.family,
      note: t('font.builtin'),
      apply: () => onChange({ fontKind: 'builtin', fontId: f.id })
    }))
    const system = (fonts ?? [])
      .filter((f) => !q || f.toLowerCase().includes(q))
      .slice(0, 300)
      .map((f) => ({
        key: `s:${f}`,
        label: f,
        family: f,
        note: '',
        apply: () => onChange({ fontKind: 'system', fontId: f })
      }))
    return [...builtin, ...system]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fonts, q, onChange])

  useEffect(() => setActive(0), [q, fonts])
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>('.fontpick__item--active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const pickFile = async (): Promise<void> => {
    const a = await window.api.pickAsset('font')
    if (a) {
      onChange({ fontKind: 'file', fontId: a.url, fontName: a.name })
      setOpen(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(items.length - 1, a + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(0, a - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = items[active]
      if (it) {
        it.apply()
        setOpen(false)
      }
    }
  }

  return (
    <div className="fontpick" ref={rootRef}>
      <button
        type="button"
        className={`fontpick__value ${open ? 'fontpick__value--open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={current}
      >
        <span className="fontpick__name">{current}</span>
        <span className="fontpick__kind">
          {t(theme.fontKind === 'builtin' ? 'font.builtin' : theme.fontKind === 'file' ? 'font.file' : 'font.system')}
        </span>
      </button>
      {open && (
        <div className="fontpick__pop">
          <input
            className="fontpick__search"
            autoFocus
            placeholder={fonts ? t('font.search', { n: fonts.length }) : t('font.searchShort')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="fontpick__list" ref={listRef}>
            {!fonts && <div className="fontpick__empty">{t('font.loading')}</div>}
            {fonts && items.length === 0 && <div className="fontpick__empty">{t('font.none')}</div>}
            {items.map((it, i) => (
              <button
                type="button"
                key={it.key}
                className={`fontpick__item ${i === active ? 'fontpick__item--active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  it.apply()
                  setOpen(false)
                }}
              >
                <span className="fontpick__sample" style={{ fontFamily: `'${it.family.replace(/'/g, '')}'` }}>
                  {it.label}
                </span>
                <span className="fontpick__preview" style={{ fontFamily: `'${it.family.replace(/'/g, '')}'` }}>
                  {t('font.preview')}
                </span>
                {it.note && <span className="fontpick__note">{it.note}</span>}
              </button>
            ))}
          </div>
          <button type="button" className="btn fontpick__file" onClick={() => void pickFile()}>
            {t('font.pickFile')}
          </button>
        </div>
      )}
    </div>
  )
}
