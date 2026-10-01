import { useEffect, useRef } from 'react'

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  w: number
  h: number
  rot: number
  vr: number
  color: string
  life: number
}

const DEFAULT_COLORS = ['#ffb829', '#ffdd2a', '#ffffff', '#8fa3ff', '#ffb829']

/** Лёгкое конфетти на canvas без зависимостей; запускается при смене `burst` */
export function Confetti({ burst, colors }: { burst: number; colors?: string[] }): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const colorsRef = useRef(colors ?? DEFAULT_COLORS)
  colorsRef.current = colors && colors.length ? colors : DEFAULT_COLORS

  useEffect(() => {
    if (!burst) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const W = (canvas.width = canvas.clientWidth * dpr)
    const H = (canvas.height = canvas.clientHeight * dpr)

    const COLORS = colorsRef.current
    const parts: Particle[] = []
    const spawn = (cx: number, cy: number, n: number, spread: number): void => {
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * spread
        const sp = (8 + Math.random() * 14) * dpr
        parts.push({
          x: cx,
          y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          w: (6 + Math.random() * 8) * dpr,
          h: (4 + Math.random() * 6) * dpr,
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          life: 1
        })
      }
    }
    spawn(W * 0.12, H * 0.95, 90, 1.1)
    spawn(W * 0.88, H * 0.95, 90, 1.1)
    spawn(W * 0.5, H * 0.7, 60, 2.4)

    let raf = 0
    let last = performance.now()
    const gravity = 0.35 * dpr
    const tick = (now: number): void => {
      const dt = Math.min(2, (now - last) / 16.67)
      last = now
      ctx.clearRect(0, 0, W, H)
      let alive = 0
      for (const p of parts) {
        if (p.life <= 0) continue
        p.vy += gravity * dt
        p.vx *= 0.985
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.rot += p.vr * dt
        if (p.y > H * 0.6) p.life -= 0.012 * dt
        if (p.y > H + 20 * dpr) p.life = 0
        if (p.life <= 0) continue
        alive++
        ctx.save()
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life))
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (alive > 0) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [burst])

  return <canvas ref={ref} className="confetti" />
}
