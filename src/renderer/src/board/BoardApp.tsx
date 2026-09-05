import { useEffect, useRef, useState } from 'react'
import { REVEAL_DELAY_MS, teamForNumber, type BoardState, type ConcreteAnimation, type SpinPayload } from '@shared/types'
import logo from '../assets/img/logo.png'
import { Confetti } from './Confetti'

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
  const [hist, setHist] = useState<BoardState>({ history: [], showHistory: true, edgeMargin: 'medium' })
  const [teams, setTeams] = useState<string[]>([])
  const rafRef = useRef(0)
  const revealRef = useRef<number | undefined>(undefined)

  // История выпавших чисел: начальное состояние и обновления (сброс, переключение показа)
  useEffect(() => {
    void window.api.getBoardState().then(setHist)
    return window.api.onBoardState(setHist)
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onSpin((p: SpinPayload) => {
      cancelAnimationFrame(rafRef.current)
      window.clearTimeout(revealRef.current)
      setTeamsMode(p.teams.length > 0)
      setTeams(p.teams)
      setAnimation(p.animation)
      setHist({ history: p.history, showHistory: p.showHistory, edgeMargin: p.edgeMargin })
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

  return (
    <div
      className={`board board--${phase}`}
      data-edge={hist.edgeMargin}
      onDoubleClick={() => window.api.boardToggleFullscreen()}>
      <div className="pattern-bg" />
      <div className="glow" />

      <div className="stage">
        {phase === 'idle' ? (
          <div className="idle">
            <img className="idle__logo" src={logo} alt="КВИЗ на БИС" />
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

      <Confetti burst={burst} />

      {phase !== 'idle' && <img className="logo" src={logo} alt="КВИЗ на БИС" />}

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
