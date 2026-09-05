import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ANIMATION_LABELS,
  ANIMATIONS,
  availableNumbers,
  EDGE_MARGIN_LABELS,
  EDGE_MARGINS,
  parseTeams,
  REVEAL_DELAY_MS,
  teamForNumber,
  type Animation,
  type DisplayStatus,
  type EdgeMargin,
  type History,
  type SpinPayload
} from '@shared/types'

interface Form {
  from: string
  to: string
  durationSec: string
  teamsText: string
  animation: Animation
  allowRepeat: boolean
  showHistory: boolean
  edgeMargin: EdgeMargin
  alwaysOnTop: boolean
}

interface LastResult {
  number: number
  team: string | null
}

const toInt = (s: string): number | null => {
  const n = Number(s.trim())
  return s.trim() !== '' && Number.isInteger(n) ? n : null
}

export function ControlApp(): React.JSX.Element {
  const [form, setForm] = useState<Form | null>(null)
  const [displays, setDisplays] = useState<DisplayStatus | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [last, setLast] = useState<LastResult | null>(null)
  const [history, setHistory] = useState<History>([])
  const [gutterScroll, setGutterScroll] = useState(0)
  const saveTimer = useRef<number | undefined>(undefined)
  const spinTimer = useRef<number | undefined>(undefined)

  // Загрузка сохранённых настроек, статуса дисплеев и истории; подписки на события main-процесса
  useEffect(() => {
    void window.api.getSettings().then((s) =>
      setForm({
        from: String(s.from),
        to: String(s.to),
        durationSec: String(s.durationSec),
        teamsText: s.teams.join('\n'),
        animation: s.animation,
        allowRepeat: s.allowRepeat,
        showHistory: s.showHistory,
        edgeMargin: s.edgeMargin,
        alwaysOnTop: s.alwaysOnTop
      })
    )
    void window.api.getDisplays().then(setDisplays)
    void window.api.getHistory().then(setHistory)
    const offDisplays = window.api.onDisplays(setDisplays)
    const offHistory = window.api.onHistory((h) => {
      setHistory(h)
      if (h.length === 0) setLast(null)
    })
    // Розыгрыш мог запустить и табло (пробел) - состояние ведём по событию из main
    const offStarted = window.api.onDrawStarted((p: SpinPayload) => {
      setSpinning(true)
      setLast(null)
      window.clearTimeout(spinTimer.current)
      spinTimer.current = window.setTimeout(() => {
        setLast({ number: p.result, team: teamForNumber(p.teams, p.result) })
        setSpinning(false)
      }, p.durationMs + REVEAL_DELAY_MS + 150)
    })
    return () => {
      offDisplays()
      offHistory()
      offStarted()
      window.clearTimeout(spinTimer.current)
    }
  }, [])

  const teams = form ? parseTeams(form.teamsText) : []
  const teamsMode = teams.length > 0
  const from = teamsMode ? 1 : form ? toInt(form.from) : null
  const to = teamsMode ? teams.length : form ? toInt(form.to) : null
  const duration = form ? toInt(form.durationSec) : null

  let error: string | null = null
  if (form) {
    if (from === null || to === null) error = 'Границы диапазона должны быть целыми числами'
    else if (from > to) error = '«От» не может быть больше «До»'
    else if (duration === null || duration < 1 || duration > 60) error = 'Длительность - целое число от 1 до 60 сек'
  }
  const pool = form && !error ? availableNumbers(from!, to!, form.allowRepeat, history) : []
  const exhausted = !!form && !error && pool.length === 0

  const update = useCallback((patch: Partial<Form>) => {
    setForm((f) => (f ? { ...f, ...patch } : f))
  }, [])

  // Автосохранение с задержкой
  useEffect(() => {
    if (!form || error) return
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void window.api.saveSettings({
        from: from!,
        to: to!,
        durationSec: duration!,
        teams,
        animation: form.animation,
        allowRepeat: form.allowRepeat,
        showHistory: form.showHistory,
        edgeMargin: form.edgeMargin,
        alwaysOnTop: form.alwaysOnTop
      })
    }, 400)
    return () => window.clearTimeout(saveTimer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form?.from,
    form?.to,
    form?.durationSec,
    form?.teamsText,
    form?.animation,
    form?.allowRepeat,
    form?.showHistory,
    form?.edgeMargin,
    form?.alwaysOnTop,
    error
  ])

  const start = useCallback(() => {
    if (!form || error || spinning || exhausted) return
    void window.api.startDraw({
      from: from!,
      to: to!,
      durationSec: duration!,
      teams,
      animation: form.animation,
      allowRepeat: form.allowRepeat,
      showHistory: form.showHistory,
      edgeMargin: form.edgeMargin,
      alwaysOnTop: form.alwaysOnTop
    })
  }, [form, error, spinning, exhausted, from, to, duration, teams])

  // Пробел / Enter вне полей ввода - СТАРТ; Ctrl/Cmd+Enter - СТАРТ откуда угодно
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement | null)?.tagName
      const inField = tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT'
      const hotkey = e.code === 'Enter' && (e.metaKey || e.ctrlKey)
      if (hotkey || (!inField && (e.code === 'Space' || e.code === 'Enter'))) {
        e.preventDefault()
        start()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [start])

  if (!form) return <div className="control" />

  const dispOk = displays?.hasSecondary ?? false
  const drawn = new Set(history)
  const lineCount = Math.max(1, form.teamsText.split('\n').length)

  return (
    <div className="control">
      <div className="scroll">
        {/* ---- табло ---- */}
        <div className={`bar ${dispOk ? 'bar--ok' : ''}`}>
          <span className="bar__dot" />
          <span className="bar__text">
            {dispOk ? (
              <>
                Дисплей <b>{displays?.secondaryLabel}</b>
                {displays?.boardVisible ? (displays?.boardFullscreen ? ' · весь экран' : ' · в окне') : ' · табло скрыто'}
              </>
            ) : (
              <>Второй дисплей не найден</>
            )}
          </span>
          <button
            className="btn btn--ghost"
            title={displays?.boardVisible ? 'Скрыть окно табло' : 'Показать окно табло'}
            onClick={() => void (displays?.boardVisible ? window.api.hideBoard() : window.api.showBoard())}
          >
            {displays?.boardVisible ? 'Скрыть' : 'Показать'}
          </button>
          <button
            className="btn btn--ghost"
            title={displays?.boardFullscreen ? 'Выйти из полного экрана' : 'Табло на весь экран'}
            onClick={() => void window.api.setBoardFullscreen(!displays?.boardFullscreen)}
          >
            {displays?.boardFullscreen ? 'Окно' : 'Весь экран'}
          </button>
        </div>

        {/* ---- розыгрыш ---- */}
        <section className="section">
          <h2 className="section__title">Розыгрыш</h2>
          <div className="row row--3">
            <div className="field">
              <label htmlFor="from">От</label>
              <input
                id="from"
                type="number"
                step={1}
                value={teamsMode ? '1' : form.from}
                disabled={teamsMode}
                onChange={(e) => update({ from: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="to">До</label>
              <input
                id="to"
                type="number"
                step={1}
                value={teamsMode ? String(teams.length) : form.to}
                disabled={teamsMode}
                onChange={(e) => update({ to: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="dur">Прокрутка, сек</label>
              <input
                id="dur"
                type="number"
                step={1}
                min={1}
                max={60}
                value={form.durationSec}
                onChange={(e) => update({ durationSec: e.target.value })}
              />
            </div>
          </div>
          <div className="row row--2">
            <div className="field">
              <label htmlFor="anim">Анимация</label>
              <select id="anim" value={form.animation} onChange={(e) => update({ animation: e.target.value as Animation })}>
                {ANIMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {ANIMATION_LABELS[a]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edge">Отступ по краям табло</label>
              <select id="edge" value={form.edgeMargin} onChange={(e) => update({ edgeMargin: e.target.value as EdgeMargin })}>
                {EDGE_MARGINS.map((m) => (
                  <option key={m} value={m}>
                    {EDGE_MARGIN_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="row row--2">
            <label className="check">
              <input
                type="checkbox"
                checked={form.allowRepeat}
                onChange={(e) => update({ allowRepeat: e.target.checked })}
              />
              <span>
                Повторы чисел
                <small>{form.allowRepeat ? 'участвуют все' : 'выпавшие исключаются'}</small>
              </span>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={form.showHistory}
                onChange={(e) => update({ showHistory: e.target.checked })}
              />
              <span>
                История на табло
                <small>список в левом углу</small>
              </span>
            </label>
          </div>
          {error && <div className="error">{error}</div>}
        </section>

        {/* ---- команды ---- */}
        <section className="section">
          <h2 className="section__title">
            Команды
            {teamsMode ? <span className="section__meta">{teams.length} · диапазон 1-{teams.length}</span> : <span className="section__meta">пусто - только цифры</span>}
          </h2>
          <div className="teams">
            <div className="teams__gutter" aria-hidden="true">
              <div style={{ transform: `translateY(-${gutterScroll}px)` }}>
                {Array.from({ length: lineCount }, (_, i) => (
                  <div key={i} className={`teams__ln ${drawn.has(i + 1) ? 'teams__ln--drawn' : ''}`}>
                    {i + 1}
                  </div>
                ))}
              </div>
            </div>
            <textarea
              id="teams"
              wrap="off"
              placeholder={'Second Hand\nБешеные Псы\nУгадай мелодию'}
              value={form.teamsText}
              spellCheck={false}
              onChange={(e) => update({ teamsText: e.target.value })}
              onScroll={(e) => setGutterScroll(e.currentTarget.scrollTop)}
            />
          </div>
        </section>

        {/* ---- история ---- */}
        <section className="section">
          <h2 className="section__title">
            Выпали
            <span className="section__meta">{history.length}</span>
            {history.length > 0 && (
              <button className="btn btn--ghost section__action" onClick={() => void window.api.resetHistory()}>
                Сбросить
              </button>
            )}
          </h2>
          <div className="chips">
            {history.length === 0 && <span className="chips__empty">Пока ничего не выпало</span>}
            {history.map((n, i) => {
              const team = teamForNumber(teams, n)
              return (
                <span key={i} className="chip">
                  <b>{n}</b>
                  {team && <span>{team}</span>}
                </span>
              )
            })}
          </div>
        </section>
      </div>

      {/* ---- закреплённый низ: СТАРТ и последний результат ---- */}
      <div className="footer">
        <button className="start" disabled={!!error || spinning || exhausted} onClick={start}>
          {spinning ? 'Крутим…' : exhausted ? 'Все числа выпали' : 'Старт'}
        </button>
        <div className="result">
          {last ? (
            <>
              <span className="result__num">{last.number}</span>
              <span className="result__team">{last.team ?? ''}</span>
            </>
          ) : (
            <span className="result__hint">
              {spinning ? 'Табло крутит…' : exhausted ? 'Сбросьте историю или включите повторы' : 'Пробел - старт'}
            </span>
          )}
        </div>
        <div className="footer__row">
          <label className="check check--inline" title="Держать окно настроек поверх всех окон">
            <input type="checkbox" checked={form.alwaysOnTop} onChange={(e) => update({ alwaysOnTop: e.target.checked })} />
            <span>Поверх всех окон</span>
          </label>
          <div className="help">
            <button className="help__btn" type="button" aria-label="Горячие клавиши">
              ?
            </button>
            <div className="help__pop">
              <div className="help__title">Горячие клавиши</div>
              <div className="help__line">
                <kbd>Пробел</kbd> / <kbd>Enter</kbd> здесь или на табло - старт
              </div>
              <div className="help__line">
                <kbd>Ctrl</kbd>+<kbd>Enter</kbd> - старт из любого поля
              </div>
              <div className="help__line">
                <kbd>Esc</kbd> на табло - выйти из полного экрана
              </div>
              <div className="help__line">
                <kbd>F</kbd> или двойной клик на табло - переключить полный экран
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
