import { app, BrowserWindow, ipcMain, screen, shell, type Display } from 'electron'
import { join } from 'node:path'
import { randomInt } from 'node:crypto'
import {
  ANIMATIONS,
  availableNumbers,
  IPC,
  type BoardState,
  type ConcreteAnimation,
  type DisplayStatus,
  type History,
  REVEAL_DELAY_MS,
  type Settings,
  type SpinPayload
} from '@shared/types'
import { loadSettings, sanitize, saveSettings } from './settings'
import { loadWindowBounds, trackWindowBounds } from './windowState'

const isDev = !!process.env['ELECTRON_RENDERER_URL']

let controlWin: BrowserWindow | null = null
let boardWin: BrowserWindow | null = null
let spinSeq = 0
/** До этого момента идёт прокрутка или объявление победителя: новый розыгрыш не запускаем */
let busyUntil = 0
/** Выпавшие числа в этой сессии; при выключенных повторах исключаются из розыгрыша */
let history: History = []
/** id дисплея, на котором сейчас стоит табло (null - обычное окно) */
let boardDisplayId: number | null = null

function preloadPath(): string {
  return join(__dirname, '../preload/index.js')
}

function loadPage(win: BrowserWindow, page: 'control' | 'board'): void {
  if (isDev) {
    void win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/${page}.html`)
  } else {
    void win.loadFile(join(__dirname, `../renderer/${page}.html`))
  }
}

function secondaryDisplay(): Display | null {
  const primary = screen.getPrimaryDisplay()
  return screen.getAllDisplays().find((d) => d.id !== primary.id) ?? null
}

function displayStatus(): DisplayStatus {
  const sec = secondaryDisplay()
  return {
    count: screen.getAllDisplays().length,
    hasSecondary: !!sec,
    secondaryLabel: sec ? `${sec.size.width}×${sec.size.height}` : null,
    boardFullscreen: !!boardWin && !boardWin.isDestroyed() && boardWin.isFullScreen(),
    boardVisible: !!boardWin && !boardWin.isDestroyed() && boardWin.isVisible()
  }
}

function boardState(): BoardState {
  const s = loadSettings()
  return { history, showHistory: s.showHistory, edgeMargin: s.edgeMargin }
}

/** Рассылает историю окну настроек и (если toBoard) табло */
function broadcastHistory(toBoard = true): void {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send(IPC.historyChanged, history)
  }
  if (toBoard && boardWin && !boardWin.isDestroyed()) {
    boardWin.webContents.send(IPC.boardState, boardState())
  }
}

function broadcastDisplays(): void {
  if (controlWin && !controlWin.isDestroyed()) {
    controlWin.webContents.send(IPC.displaysChanged, displayStatus())
  }
}

let onTopTimer: NodeJS.Timeout | undefined

/**
 * «Поверх всех окон» для окна настроек. На Windows все topmost-окна равноправны (PowerPoint в режиме
 * показа тоже topmost) и активированное окно перекрывает наше, поэтому после потери фокуса и по таймеру
 * поднимаем окно заново без захвата фокуса.
 */
function applyAlwaysOnTop(on: boolean): void {
  clearInterval(onTopTimer)
  onTopTimer = undefined
  if (!controlWin || controlWin.isDestroyed()) return
  controlWin.setAlwaysOnTop(on, 'screen-saver')
  if (on && process.platform === 'win32') {
    onTopTimer = setInterval(() => {
      if (!controlWin || controlWin.isDestroyed() || !controlWin.isVisible() || controlWin.isMinimized()) return
      if (!controlWin.isAlwaysOnTop()) controlWin.setAlwaysOnTop(true, 'screen-saver')
      controlWin.moveTop()
    }, 1500)
  }
}

function createControlWindow(): void {
  const saved = loadWindowBounds('control')
  controlWin = new BrowserWindow({
    ...(saved ?? { width: 440, height: 720 }),
    minWidth: 380,
    minHeight: 440,
    title: 'Рандомайзер - КВИЗ на БИС',
    backgroundColor: '#00148b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  controlWin.once('ready-to-show', () => {
    controlWin?.show()
    applyAlwaysOnTop(loadSettings().alwaysOnTop)
  })
  controlWin.on('focus', () => {
    // Вместе с окном настроек поднимаем и табло (без передачи ему фокуса), если оно показано
    if (boardWin && !boardWin.isDestroyed() && boardWin.isVisible() && !boardWin.isMinimized()) {
      boardWin.moveTop()
      // на Windows активированное окно (например, PowerPoint) могло встать выше - повторим чуть позже
      if (process.platform === 'win32') {
        setTimeout(() => {
          if (boardWin && !boardWin.isDestroyed() && boardWin.isVisible()) boardWin.moveTop()
        }, 250)
      }
    }
  })
  controlWin.on('blur', () => {
    // Другое topmost-окно получило фокус и встало выше - через мгновение возвращаемся наверх
    if (loadSettings().alwaysOnTop && process.platform === 'win32') {
      setTimeout(() => {
        if (controlWin && !controlWin.isDestroyed() && controlWin.isVisible()) controlWin.moveTop()
      }, 250)
    }
  })
  trackWindowBounds(controlWin, 'control')
  controlWin.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  controlWin.on('closed', () => {
    clearInterval(onTopTimer)
    controlWin = null
    app.quit()
  })
  loadPage(controlWin, 'control')
}

function createBoardWindow(): void {
  const sec = secondaryDisplay()
  boardDisplayId = sec?.id ?? null
  // Без второго дисплея табло - обычное окно, помним его положение и размер
  const savedBoard = sec ? null : loadWindowBounds('board')
  boardWin = new BrowserWindow({
    ...(sec
      ? { x: sec.bounds.x, y: sec.bounds.y, width: sec.bounds.width, height: sec.bounds.height }
      : (savedBoard ?? { width: 1280, height: 720 })),
    minWidth: 480,
    minHeight: 270,
    title: 'Табло - КВИЗ на БИС',
    backgroundColor: '#00148b',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  boardWin.once('ready-to-show', () => {
    if (!boardWin) return
    boardWin.show()
    if (sec) boardWin.setFullScreen(true)
    broadcastDisplays()
  })
  trackWindowBounds(boardWin, 'board')
  boardWin.on('enter-full-screen', broadcastDisplays)
  boardWin.on('leave-full-screen', broadcastDisplays)
  boardWin.on('show', broadcastDisplays)
  boardWin.on('hide', broadcastDisplays)
  // Закрытие табло только прячет его - ведущий вернёт его кнопкой в окне настроек
  boardWin.on('close', (e) => {
    if (controlWin && !controlWin.isDestroyed()) {
      e.preventDefault()
      boardWin?.hide()
    }
  })
  boardWin.on('closed', () => {
    boardWin = null
  })
  loadPage(boardWin, 'board')
}

/** Переносит табло на второй дисплей, если он появился, и включает fullscreen */
function moveBoardToSecondary(): void {
  if (!boardWin || boardWin.isDestroyed()) return
  const sec = secondaryDisplay()
  if (!sec) {
    if (boardDisplayId !== null) {
      // Второй дисплей отключили - возвращаемся в обычное окно на основном экране
      boardDisplayId = null
      if (boardWin.isFullScreen()) boardWin.setFullScreen(false)
      const p = screen.getPrimaryDisplay().workArea
      boardWin.setBounds({ x: p.x + 40, y: p.y + 40, width: Math.min(1280, p.width - 80), height: Math.min(720, p.height - 80) })
    }
    broadcastDisplays()
    return
  }
  if (boardDisplayId === sec.id && boardWin.isFullScreen()) return
  boardDisplayId = sec.id
  if (boardWin.isFullScreen()) boardWin.setFullScreen(false)
  boardWin.setBounds(sec.bounds)
  boardWin.show()
  boardWin.setFullScreen(true)
  broadcastDisplays()
}

/** Общий розыгрыш для обоих окон: выбирает результат, шлёт табло прокрутку, окну настроек - событие */
function runDraw(settings: Settings): SpinPayload | null {
  if (Date.now() < busyUntil) return null
  const s = saveSettings(settings)
  const pool = availableNumbers(s.from, s.to, s.allowRepeat, history)
  if (pool.length === 0) return null
  const result = pool[randomInt(0, pool.length)]
  const concrete = ANIMATIONS.filter((a): a is ConcreteAnimation => a !== 'random')
  const animation: ConcreteAnimation =
    s.animation === 'random' ? concrete[randomInt(0, concrete.length)] : s.animation
  const payload: SpinPayload = {
    seq: ++spinSeq,
    from: s.from,
    to: s.to,
    durationMs: s.durationSec * 1000,
    result,
    teams: s.teams,
    animation,
    exclude: s.allowRepeat ? [] : history.filter((n) => n >= s.from && n <= s.to),
    history: [...history],
    showHistory: s.showHistory,
    edgeMargin: s.edgeMargin
  }
  busyUntil = Date.now() + payload.durationMs + REVEAL_DELAY_MS + 300
  history = [...history, result]
  // Табло не получает обновление сейчас - иначе результат засветится в истории до финала
  broadcastHistory(false)
  if (!boardWin || boardWin.isDestroyed()) createBoardWindow()
  else if (!boardWin.isVisible()) boardWin.show()
  boardWin?.webContents.send(IPC.boardSpin, payload)
  if (controlWin && !controlWin.isDestroyed()) controlWin.webContents.send(IPC.drawStarted, payload)
  return payload
}

function registerIpc(): void {
  ipcMain.handle(IPC.settingsGet, (): Settings => loadSettings())
  ipcMain.handle(IPC.settingsSet, (_e, s: Partial<Settings>): Settings => {
    const before = loadSettings()
    const saved = saveSettings(s)
    if (saved.alwaysOnTop !== before.alwaysOnTop) applyAlwaysOnTop(saved.alwaysOnTop)
    const boardChanged = saved.showHistory !== before.showHistory || saved.edgeMargin !== before.edgeMargin
    if (boardChanged && boardWin && !boardWin.isDestroyed()) {
      boardWin.webContents.send(IPC.boardState, boardState())
    }
    return saved
  })
  ipcMain.handle(IPC.boardStateGet, (): BoardState => boardState())
  ipcMain.handle(IPC.displaysGet, (): DisplayStatus => displayStatus())

  ipcMain.handle(IPC.historyGet, (): History => history)
  ipcMain.handle(IPC.historyReset, (): History => {
    history = []
    broadcastHistory()
    // Табло тоже возвращается на стартовый экран
    if (boardWin && !boardWin.isDestroyed()) boardWin.webContents.send(IPC.boardReset)
    return history
  })

  ipcMain.handle(IPC.drawStart, (_e, input: Partial<Settings>): SpinPayload | null =>
    runDraw(sanitize(input))
  )
  // Запуск с табло (пробел): берём сохранённые настройки
  ipcMain.handle(IPC.drawRequest, (): SpinPayload | null => runDraw(loadSettings()))

  ipcMain.handle(IPC.boardShow, () => {
    if (!boardWin || boardWin.isDestroyed()) createBoardWindow()
    else {
      boardWin.show()
      boardWin.focus()
    }
    return displayStatus()
  })

  ipcMain.handle(IPC.boardHide, () => {
    if (boardWin && !boardWin.isDestroyed()) boardWin.hide()
    return displayStatus()
  })

  ipcMain.handle(IPC.boardSetFullscreen, (_e, on: boolean) => {
    if (!boardWin || boardWin.isDestroyed()) createBoardWindow()
    else {
      if (on) {
        const sec = secondaryDisplay()
        if (sec && boardDisplayId !== sec.id) {
          boardDisplayId = sec.id
          boardWin.setBounds(sec.bounds)
        }
        boardWin.show()
      }
      boardWin.setFullScreen(on)
    }
    return displayStatus()
  })

  ipcMain.on(IPC.boardEscape, () => {
    if (boardWin && !boardWin.isDestroyed() && boardWin.isFullScreen()) boardWin.setFullScreen(false)
  })
  ipcMain.on(IPC.boardToggleFullscreen, () => {
    if (boardWin && !boardWin.isDestroyed()) boardWin.setFullScreen(!boardWin.isFullScreen())
  })
}

app.whenReady().then(() => {
  registerIpc()
  createControlWindow()
  createBoardWindow()

  screen.on('display-added', () => setTimeout(moveBoardToSecondary, 300))
  screen.on('display-removed', () => setTimeout(moveBoardToSecondary, 300))
  screen.on('display-metrics-changed', broadcastDisplays)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow()
      createBoardWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
