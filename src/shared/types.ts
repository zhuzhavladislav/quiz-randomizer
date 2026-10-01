import { DEFAULT_PRESET_ID, DEFAULT_THEME, type Theme } from './theme'

/** Варианты анимации прокрутки; random - табло выбирает случайный на каждый розыгрыш */
export const ANIMATIONS = ['drum', 'flip', 'zoom', 'slide', 'random'] as const
export type Animation = (typeof ANIMATIONS)[number]
export type ConcreteAnimation = Exclude<Animation, 'random'>

export const ANIMATION_LABELS: Record<Animation, string> = {
  drum: 'Барабан',
  flip: 'Переворот',
  zoom: 'Зум',
  slide: 'Сдвиг',
  random: 'Случайная'
}

/** Отступ от левого и правого края табло: на некоторых экранах края обрезаются */
export const EDGE_MARGINS = ['small', 'medium', 'large'] as const
export type EdgeMargin = (typeof EDGE_MARGINS)[number]

export const EDGE_MARGIN_LABELS: Record<EdgeMargin, string> = {
  small: 'Меньше',
  medium: 'Средний',
  large: 'Больше'
}

/** Настройки ведущего, хранятся в userData/settings.json */
export interface Settings {
  from: number
  to: number
  durationSec: number
  /** Список команд по одной на строку; пусто - на табло только цифры */
  teams: string[]
  animation: Animation
  /** true - число может выпасть повторно; false - выпавшие исключаются до сброса */
  allowRepeat: boolean
  /** Показывать список выпавших чисел в углу табло */
  showHistory: boolean
  edgeMargin: EdgeMargin
  /** Окно настроек поверх всех окон */
  alwaysOnTop: boolean
  theme: Theme
  /** Пресет, от которого отталкивается текущая тема (для подписи «изменён») */
  presetId: string
  /** Дисплей для табло: 'auto' - второй (не основной), иначе id дисплея */
  boardDisplay: 'auto' | number
}

export const DEFAULT_SETTINGS: Settings = {
  from: 1,
  to: 20,
  durationSec: 5,
  teams: [],
  animation: 'drum',
  allowRepeat: false,
  showHistory: true,
  edgeMargin: 'medium',
  alwaysOnTop: false,
  theme: DEFAULT_THEME,
  presetId: DEFAULT_PRESET_ID,
  boardDisplay: 'auto'
}

/** Пауза между остановкой барабана и объявлением победителя */
export const REVEAL_DELAY_MS = 1000

/** Команда табло на прокрутку: результат выбран заранее в main-процессе */
export interface SpinPayload {
  seq: number
  from: number
  to: number
  durationMs: number
  result: number
  teams: string[]
  animation: ConcreteAnimation
  /** Числа, которые нельзя показывать при прокрутке (уже выпали, повторы выключены) */
  exclude: number[]
  /** История до этого розыгрыша - табло допишет результат само после финала */
  history: History
  showHistory: boolean
  edgeMargin: EdgeMargin
}

/** Состояние табло, не связанное с конкретным розыгрышем */
export interface BoardState {
  history: History
  showHistory: boolean
  edgeMargin: EdgeMargin
  theme: Theme
}

/** Выбранный пользователем файл, скопированный в папку данных приложения */
export interface PickedAsset {
  url: string
  name: string
}

/** Уже выпавшие числа в текущей сессии (в порядке выпадения) */
export type History = number[]

export interface DisplayInfo {
  id: number
  /** Например «LG HDR 4K · 3840×2160» */
  label: string
  primary: boolean
}

export interface DisplayStatus {
  displays: DisplayInfo[]
  /** Дисплей, выбранный для табло (с учётом «авто»); null - подходящего нет, табло в окне */
  targetId: number | null
  hasSecondary: boolean
  /** Например «2560×1440» */
  secondaryLabel: string | null
  boardFullscreen: boolean
  boardVisible: boolean
}

export const IPC = {
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  drawStart: 'draw:start',
  drawRequest: 'draw:request',
  drawStarted: 'draw:started',
  displaysGet: 'displays:get',
  displaysChanged: 'displays:changed',
  boardShow: 'board:show',
  boardHide: 'board:hide',
  boardSetFullscreen: 'board:set-fullscreen',
  boardSpin: 'board:spin',
  historyGet: 'history:get',
  historyReset: 'history:reset',
  historyChanged: 'history:changed',
  boardStateGet: 'board:state-get',
  boardState: 'board:state',
  boardReset: 'board:reset',
  boardReady: 'board:ready',
  presetsList: 'presets:list',
  presetsSave: 'presets:save',
  presetsDelete: 'presets:delete',
  presetsExport: 'presets:export',
  presetsImport: 'presets:import',
  assetPick: 'asset:pick',
  boardEscape: 'board:escape',
  boardToggleFullscreen: 'board:toggle-fullscreen'
} as const

/** Название команды для выпавшего числа (нумерация с 1) */
export function teamForNumber(teams: string[], n: number): string | null {
  const name = teams[n - 1]
  return name && name.trim() ? name.trim() : null
}

export function parseTeams(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** Числа диапазона, доступные для розыгрыша с учётом режима повторов */
export function availableNumbers(from: number, to: number, allowRepeat: boolean, history: History): number[] {
  const used = allowRepeat ? new Set<number>() : new Set(history)
  const pool: number[] = []
  for (let n = from; n <= to; n++) if (!used.has(n)) pool.push(n)
  return pool
}
