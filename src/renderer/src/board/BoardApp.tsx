import { useEffect, useRef, useState } from 'react'
import { REVEAL_DELAY_MS, teamForNumber, type BoardState, type ConcreteAnimation, type SpinPayload } from '@shared/types'
import { DEFAULT_THEME, themeFontFamily, type Theme } from '@shared/theme'
import { Confetti } from './Confetti'

/** Регистрирует файл шрифта пользователя как семейство ThemeFont (все веса - из одного файла) */
async function loadThemeFont(url: string): Promise<void> {
  for (const f of document.fonts) if (f.family === 'ThemeFont') document.fonts.delete(f)
  if (!url) return
  try {
    const face = new FontFace('ThemeFont', `url("${url}")`, { weight: '100 900', display: 'block' })
    await face.load()
    document.fonts.add(face)
  } catch (e) {
    console.error('Не удалось загрузить шрифт темы:', e)
  }
}

function imageUrl(kind: Theme['logoKind'], url: string): string | null {
  return kind === 'file' && url ? url : null
}

function preloadImage(url: string | null): Promise<void> {
  if (!url) return Promise.resolve()
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => resolve()
    img.src = url
  })
}

/** Ждёт картинки и шрифт темы (не дольше 4 с), чтобы табло появилось сразу готовым */
async function preloadTheme(t: Theme): Promise<void> {
  const work = Promise.all([
    preloadImage(imageUrl(t.patternKind, t.patternUrl)),
    preloadImage(imageUrl(t.logoKind, t.logoUrl)),
    t.fontKind === 'file' ? loadThemeFont(t.fontId) : document.fonts.load(`900 100px ${themeFontFamily(t)}`).then(() => undefined)
  ])
  await Promise.race([work, new Promise((r) => setTimeout(r, 4000))])
}

/** landed - барабан остановился, число показано, но ещё не объявлено победным */
type Phase = 'idle' | 'spinning' | 'landed' | 'done'


interface View {
  number: number
  team: string | null
  tickKey: number
}

/** Перетасовка Фишера-Йейтса, возвращает новый массив */
function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Интервал между сменами чисел: 45 мс в начале → ~420 мс в конце (ease-out) */
function intervalAt(progress: number): number {
  const eased = 1 - Math.pow(1 - progress, 3)
  return 45 + eased * 375
}

export function BoardApp(): React.JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [view, setView] = useState<View>({ number: 0, team: null, tickKey: 0 })
  const [burst, setBurst] = useState(0)
  const [teamsMode, setTeamsMode] = useState(false)
  const [animation, setAnimation] = useState<ConcreteAnimation>('drum')
  const [hist, setHist] = useState<BoardState>({ history: [], showHistory: true, edgeMargin: 'medium', theme: DEFAULT_THEME })
  const [teams, setTeams] = useState<string[]>([])
  const rafRef = useRef(0)
  const revealRef = useRef<number | undefined>(undefined)

  // История выпавших чисел и тема: начальное состояние и обновления из окна настроек.
  // Окно показывается только после загрузки картинок и шрифта темы - чтобы паттерн не «проявлялся» на глазах
  useEffect(() => {
    void window.api.getBoardState().then(async (st) => {
      setHist(st)
      await preloadTheme(st.theme)
      window.api.boardReady()
    })
    return window.api.onBoardState(setHist)
  }, [])

  const theme = hist.theme

  // Шрифт из файла и заголовок окна следуют за темой
  useEffect(() => {
    void loadThemeFont(theme.fontKind === 'file' ? theme.fontId : '')
  }, [theme.fontKind, theme.fontId])
  useEffect(() => {
    document.title = theme.title ? `Табло - ${theme.title}` : 'Табло'
    document.body.style.backgroundColor = theme.bgColor
  }, [theme.title, theme.bgColor])

  useEffect(() => {
    const unsubscribe = window.api.onSpin((p: SpinPayload) => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(revealRef.current)
      setTeamsMode(p.teams.length > 0)
      setTeams(p.teams)
      setAnimation(p.animation)
      setHist((h) => ({ ...h, history: p.history, showHistory: p.showHistory, edgeMargin: p.edgeMargin }))
      setPhase('spinning')

      const start = performance.now()
      let nextChange = start
      let current = p.result
      let tick = 0
      // Числа, которые можно показывать при прокрутке: диапазон без исключённых
      const excluded = new Set(p.exclude)
      const pool: number[] = []
      for (let n = p.from; n <= p.to; n++) if (!excluded.has(n)) pool.push(n)
      if (!pool.includes(p.result)) pool.push(p.result)

      // Перебор идёт по тасованному кругу: каждое число показывается по разу, затем новая перетасовка,
      // чтобы ни одно число не казалось «пропавшим». Результат участвует наравне со всеми.
      let queue: number[] = []
      const pick = (): number => {
        if (pool.length <= 1) return p.result
        if (queue.length === 0) {
          queue = shuffle(pool)
          // не повторять подряд последнее показанное число на стыке кругов
          if (queue[0] === current && queue.length > 1) {
            const j = 1 + Math.floor(Math.random() * (queue.length - 1))
            ;[queue[0], queue[j]] = [queue[j], queue[0]]
          }
        }
        return queue.shift()!
      }

      // Первое число ставим сразу, чтобы предыдущий результат не мелькнул в первом кадре прокрутки
      current = pick()
      setView({ number: current, team: teamForNumber(p.teams, current), tickKey: ++tick })
      nextChange = start + intervalAt(0)

      const frame = (now: number): void => {
        const elapsed = now - start
        // Финал наступает в такт барабана: на ближайшей запланированной смене после истечения времени,
        // чтобы предыдущее число не обрывалось на середине своей анимации
        if (elapsed >= p.durationMs && now >= nextChange) {
          // Число встаёт как обычный шаг барабана, победным объявляется с задержкой
          setView({ number: p.result, team: teamForNumber(p.teams, p.result), tickKey: ++tick })
          setPhase('landed')
          revealRef.current = window.setTimeout(() => {
            setPhase('done')
            setBurst((b) => b + 1)
            setHist((h) => ({ ...h, history: [...h.history, p.result] }))
          }, REVEAL_DELAY_MS)
          return
        }
        if (now >= nextChange) {
          current = pick()
          setView({ number: current, team: teamForNumber(p.teams, current), tickKey: ++tick })
          nextChange = now + intervalAt(elapsed / p.durationMs)
        }
        rafRef.current = requestAnimationFrame(frame)
      }
      rafRef.current = requestAnimationFrame(frame)
    })
    return () => {
      unsubscribe()
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(revealRef.current)
    }
  }, [])

  // Сброс из окна настроек: табло возвращается на стартовый экран
  useEffect(() => {
    return window.api.onBoardReset(() => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(revealRef.current)
      setPhase('idle')
      setView({ number: 0, team: null, tickKey: 0 })
    })
  }, [])

  // Esc - выйти из полноэкранного режима, F - переключить, пробел/Enter - новый розыгрыш
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') window.api.boardEscape()
      else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault()
        void window.api.requestDraw()
      } else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') window.api.boardToggleFullscreen()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const digits = Math.max(1, String(Math.abs(view.number)).length + (view.number < 0 ? 1 : 0))
  const teamLong = (view.team?.length ?? 0) > 18
  const logoSrc = imageUrl(theme.logoKind, theme.logoUrl)
  const patternSrc = imageUrl(theme.patternKind, theme.patternUrl)
  const themeVars = {
    '--bg': theme.bgColor,
    '--digit': theme.digitColor,
    '--text': theme.textColor,
    '--shadow': theme.shadowColor,
    '--shadow-a': theme.shadowOpacity,
    '--font': themeFontFamily(theme),
    '--pattern-opacity': theme.patternOpacity,
    '--pattern-scale': theme.patternScale,
    '--logo-scale': theme.logoScale
  } as React.CSSProperties

  return (
    <div
      className={`board board--${phase} ${theme.bgGlow ? 'board--glow' : ''}`}
      data-edge={hist.edgeMargin}
      style={themeVars}
      onDoubleClick={() => window.api.boardToggleFullscreen()}>
      {patternSrc && <div className="pattern-bg" style={{ backgroundImage: `url("${patternSrc}")` }} />}
      <div className="glow" />

      <div className="stage">
        {phase === 'idle' ? (
          <div className="idle">
            {logoSrc ? (
              <img className="idle__logo" src={logoSrc} alt={theme.title} />
            ) : (
              theme.title && <div className="idle__title">{theme.title}</div>
            )}
          </div>
        ) : (
          <>
            <div
              key={view.tickKey}
              className={[
                'number',
                teamsMode ? 'number--with-team' : '',
                `number--${animation}`,
                phase === 'done' ? 'number--done' : 'number--tick'
              ].join(' ')}
              style={{ ['--digits' as string]: digits }}
            >
              {view.number}
            </div>
            {teamsMode && (
              <div
                key={phase === 'done' ? 'team-stamp' : 'team'}
                className={[
                  'team',
                  teamLong ? 'team--long' : '',
                  phase === 'done' ? 'team--stamp' : 'team--spinning'
                ].join(' ')}
              >
                {view.team ?? ''}
              </div>
            )}
          </>
        )}
      </div>

      {theme.confetti && <Confetti burst={burst} colors={theme.confettiColors} />}

      {phase !== 'idle' && logoSrc && <img className="logo" src={logoSrc} alt="" />}

      {hist.showHistory && hist.history.length > 0 && (
        <div className="history">
          <div className="history__list">
            {hist.history.map((n, i) => {
              const team = teamForNumber(teams, n)
              return (
                <div key={i} className="history__item">
                  <span className="history__num">{n}</span>
                  {team && <span className="history__team">{team}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
