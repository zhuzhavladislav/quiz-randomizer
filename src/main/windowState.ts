import { app, screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

type WindowKey = 'control' | 'board'
type StateFile = Partial<Record<WindowKey, Rectangle>>

function filePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

function readAll(): StateFile {
  try {
    return JSON.parse(readFileSync(filePath(), 'utf8')) as StateFile
  } catch {
    return {}
  }
}

function writeAll(state: StateFile): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(filePath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (e) {
    console.error('Не удалось сохранить состояние окна:', e)
  }
}

/** Сохранённые границы окна, если они хотя бы частично попадают на один из текущих дисплеев */
export function loadWindowBounds(key: WindowKey): Rectangle | null {
  const b = readAll()[key]
  if (!b || ![b.x, b.y, b.width, b.height].every(Number.isFinite)) return null
  const visible = screen.getAllDisplays().some((d) => {
    const a = d.workArea
    return b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y < a.y + a.height - 40 && b.y + b.height > a.y
  })
  return visible ? b : null
}

/** Запоминает положение и размер окна при перемещении/изменении размера (с задержкой) */
export function trackWindowBounds(win: BrowserWindow, key: WindowKey): void {
  let timer: NodeJS.Timeout | undefined
  const save = (): void => {
    if (win.isDestroyed() || win.isFullScreen() || win.isMinimized()) return
    const state = readAll()
    state[key] = win.getNormalBounds()
    writeAll(state)
  }
  const schedule = (): void => {
    clearTimeout(timer)
    timer = setTimeout(save, 300)
  }
  win.on('move', schedule)
  win.on('resize', schedule)
  win.on('close', () => {
    clearTimeout(timer)
    save()
  })
}
