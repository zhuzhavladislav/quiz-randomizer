/** Оформление табло: шрифт, цвета, паттерн, логотип. Хранится в настройках, пресеты - в presets.json */

/** Встроенные шрифты (в комплекте с приложением); остальные берутся из системы или из файла */
export const BUILTIN_FONTS = [{ id: 'montserrat', label: 'Montserrat', family: 'Montserrat' }] as const
export type BuiltinFontId = (typeof BUILTIN_FONTS)[number]['id']

export type FontKind = 'builtin' | 'system' | 'file'
export type ImageKind = 'none' | 'file'

export interface Theme {
  /** Название на стартовом экране табло (если нет логотипа) и в заголовке окон */
  title: string
  fontKind: FontKind
  /** builtin: id из BUILTIN_FONTS; system: имя семейства; file: asset-URL файла */
  fontId: string
  /** Имя файла шрифта для отображения в настройках */
  fontName: string
  bgColor: string
  /** Светлое пятно в центре фона */
  bgGlow: boolean
  digitColor: string
  textColor: string
  /** Цвет тени у цифр и её плотность 0..1 (0 - без тени) */
  shadowColor: string
  shadowOpacity: number
  confetti: boolean
  /** Цвета конфетти, 1..6 */
  confettiColors: string[]
  patternKind: ImageKind
  patternUrl: string
  patternName: string
  /** 0..1 */
  patternOpacity: number
  /** Множитель размера тайла, 0.25..3 */
  patternScale: number
  logoKind: ImageKind
  logoUrl: string
  logoName: string
  /** Множитель размера логотипа в углу, 0.5..2 */
  logoScale: number
}

export interface Preset {
  id: string
  name: string
  theme: Theme
}

/** Нейтральная тема по умолчанию; «КВИЗ на БИС» - обычный пресет, который main создаёт при первом запуске */
export const DEFAULT_THEME: Theme = {
  title: 'Рандомайзер',
  fontKind: 'builtin',
  fontId: 'montserrat',
  fontName: '',
  bgColor: '#151515',
  bgGlow: true,
  digitColor: '#ffffff',
  textColor: '#c8c8c8',
  shadowColor: '#000000',
  shadowOpacity: 0.35,
  confetti: true,
  confettiColors: ['#ffffff', '#c8c8c8', '#8a8a8a'],
  patternKind: 'none',
  patternUrl: '',
  patternName: '',
  patternOpacity: 0.12,
  patternScale: 1,
  logoKind: 'none',
  logoUrl: '',
  logoName: '',
  logoScale: 1
}

/** id пресета «КВИЗ на БИС», создаваемого при первом запуске */
export const QUIZNABIS_PRESET_ID = 'quiznabis'
export const DEFAULT_PRESET_ID = QUIZNABIS_PRESET_ID

/** Префикс URL файлов пользователя, которые раздаёт main-процесс */
export const ASSET_URL_PREFIX = 'asset://local/'

const HEX = /^#[0-9a-f]{6}$/i

function hex(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim()
  return HEX.test(s) ? s.toLowerCase() : fallback
}

function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}

function assetUrl(v: unknown): string {
  const s = String(v ?? '')
  return s.startsWith(ASSET_URL_PREFIX) ? s : ''
}

export const CONFETTI_MAX = 6

/** Если цветов нет (старые пресеты), берём цвет цифр, цвет текста и белый - так конфетти выглядело раньше */
function confettiColors(v: unknown, digit: string, text: string): string[] {
  const list = Array.isArray(v) ? v.map((c) => hex(c, '')).filter(Boolean).slice(0, CONFETTI_MAX) : []
  return list.length ? list : [...new Set([digit, text, '#ffffff'])]
}

function str(v: unknown, max: number): string {
  return String(v ?? '')
    .replace(/[\r\n]/g, ' ')
    .trim()
    .slice(0, max)
}

/** Приводит произвольный объект к корректной теме; недостающие поля берёт из DEFAULT_THEME */
export function sanitizeTheme(input: Partial<Theme> | null | undefined): Theme {
  const t = { ...DEFAULT_THEME, ...(input ?? {}) }
  const fontKind: FontKind = t.fontKind === 'system' || t.fontKind === 'file' ? t.fontKind : 'builtin'
  let fontId = str(t.fontId, 300)
  if (fontKind === 'builtin' && !BUILTIN_FONTS.some((f) => f.id === fontId)) fontId = DEFAULT_THEME.fontId
  if (fontKind === 'file') fontId = assetUrl(fontId)
  const imageKind = (v: unknown): ImageKind => (v === 'file' ? 'file' : 'none')
  const patternKind = imageKind(t.patternKind)
  const logoKind = imageKind(t.logoKind)
  return {
    title: str(t.title, 60),
    fontKind,
    fontId,
    fontName: str(t.fontName, 120),
    bgColor: hex(t.bgColor, DEFAULT_THEME.bgColor),
    bgGlow: typeof t.bgGlow === 'boolean' ? t.bgGlow : true,
    digitColor: hex(t.digitColor, DEFAULT_THEME.digitColor),
    textColor: hex(t.textColor, DEFAULT_THEME.textColor),
    shadowColor: hex(t.shadowColor, DEFAULT_THEME.shadowColor),
    shadowOpacity: num(t.shadowOpacity, 0, 1, DEFAULT_THEME.shadowOpacity),
    confetti: typeof t.confetti === 'boolean' ? t.confetti : true,
    // смотрим в исходный объект: в t поле уже подставлено из DEFAULT_THEME
    confettiColors: confettiColors(
      input?.confettiColors,
      hex(t.digitColor, DEFAULT_THEME.digitColor),
      hex(t.textColor, DEFAULT_THEME.textColor)
    ),
    patternKind,
    patternUrl: patternKind === 'file' ? assetUrl(t.patternUrl) : '',
    patternName: str(t.patternName, 120),
    patternOpacity: num(t.patternOpacity, 0, 1, DEFAULT_THEME.patternOpacity),
    patternScale: num(t.patternScale, 0.25, 3, 1),
    logoKind,
    logoUrl: logoKind === 'file' ? assetUrl(t.logoUrl) : '',
    logoName: str(t.logoName, 120),
    logoScale: num(t.logoScale, 0.5, 2, 1)
  }
}

/** CSS font-family для темы; для файла шрифта табло регистрирует семейство ThemeFont */
export function themeFontFamily(t: Theme): string {
  if (t.fontKind === 'builtin') {
    return `'${BUILTIN_FONTS.find((f) => f.id === t.fontId)?.family ?? 'Montserrat'}'`
  }
  if (t.fontKind === 'file') return t.fontId ? "'ThemeFont'" : "'Montserrat'"
  return t.fontId ? `'${t.fontId.replace(/'/g, '')}'` : "'Montserrat'"
}

export function themesEqual(a: Theme, b: Theme): boolean {
  return JSON.stringify(sanitizeTheme(a)) === JSON.stringify(sanitizeTheme(b))
}

/** Формат файла пресета (.rpreset - zip с preset.json и папкой assets) */
export const PRESET_FILE_EXT = 'rpreset'
export const PRESET_FILE_FORMAT = 'randomizer-preset'
