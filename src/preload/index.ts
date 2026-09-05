import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type BoardState, type DisplayStatus, type History, type Settings, type SpinPayload } from '@shared/types'

type Unsubscribe = () => void

function subscribe<T>(channel: string, cb: (data: T) => void): Unsubscribe {
  const handler = (_e: IpcRendererEvent, data: T): void => cb(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.off(channel, handler)
}

const api = {
  /* --- окно настроек --- */
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
  saveSettings: (s: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, s),
  startDraw: (s: Partial<Settings>): Promise<SpinPayload | null> => ipcRenderer.invoke(IPC.drawStart, s),
  onDrawStarted: (cb: (p: SpinPayload) => void): Unsubscribe => subscribe(IPC.drawStarted, cb),
  getHistory: (): Promise<History> => ipcRenderer.invoke(IPC.historyGet),
  resetHistory: (): Promise<History> => ipcRenderer.invoke(IPC.historyReset),
  onHistory: (cb: (h: History) => void): Unsubscribe => subscribe(IPC.historyChanged, cb),
  getDisplays: (): Promise<DisplayStatus> => ipcRenderer.invoke(IPC.displaysGet),
  onDisplays: (cb: (d: DisplayStatus) => void): Unsubscribe => subscribe(IPC.displaysChanged, cb),
  showBoard: (): Promise<DisplayStatus> => ipcRenderer.invoke(IPC.boardShow),
  hideBoard: (): Promise<DisplayStatus> => ipcRenderer.invoke(IPC.boardHide),
  setBoardFullscreen: (on: boolean): Promise<DisplayStatus> => ipcRenderer.invoke(IPC.boardSetFullscreen, on),

  /* --- табло --- */
  onSpin: (cb: (p: SpinPayload) => void): Unsubscribe => subscribe(IPC.boardSpin, cb),
  getBoardState: (): Promise<BoardState> => ipcRenderer.invoke(IPC.boardStateGet),
  onBoardState: (cb: (h: BoardState) => void): Unsubscribe => subscribe(IPC.boardState, cb),
  onBoardReset: (cb: () => void): Unsubscribe => subscribe(IPC.boardReset, cb),
  requestDraw: (): Promise<SpinPayload | null> => ipcRenderer.invoke(IPC.drawRequest),
  boardEscape: (): void => ipcRenderer.send(IPC.boardEscape),
  boardToggleFullscreen: (): void => ipcRenderer.send(IPC.boardToggleFullscreen)
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
