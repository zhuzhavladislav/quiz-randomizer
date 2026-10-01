import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ANIMATIONS, DEFAULT_SETTINGS, EDGE_MARGINS, type Animation, type EdgeMargin, type Settings } from '@shared/types'
import { DEFAULT_PRESET_ID, sanitizeTheme, type Theme } from '@shared/theme'
import { LANGUAGES, type LanguageSetting } from '@shared/i18n'

function filePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

/** Настройки версии 1.0 ссылались на встроенные логотип/паттерн - их больше нет, картинка снимается */
function migrateTheme(t: Partial<Theme> | undefined): Partial<Theme> | undefined {
  if (!t) return t
  const m: Record<string, unknown> = { ...t }
  if (m.patternKind === 'builtin') m.patternKind = 'none'
  if (m.logoKind === 'builtin') m.logoKind = 'none'
  return m as Partial<Theme>
}

export function sanitize(input: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(input ?? {}), theme: migrateTheme(input?.theme) }
  const int = (v: unknown, fallback: number): number => {
    const n = Math.trunc(Number(v))
    return Number.isFinite(n) ? n : fallback
  }
  let from = int(s.from, DEFAULT_SETTINGS.from)
  let to = int(s.to, DEFAULT_SETTINGS.to)
  if (from > to) [from, to] = [to, from]
  const durationSec = Math.min(60, Math.max(1, int(s.durationSec, DEFAULT_SETTINGS.durationSec)))
  const teams = Array.isArray(s.teams)
    ? s.teams.map((t) => String(t).trim()).filter(Boolean).slice(0, 500)
    : []
  const animation: Animation = (ANIMATIONS as readonly string[]).includes(String(s.animation))
    ? (s.animation as Animation)
    : DEFAULT_SETTINGS.animation
  const allowRepeat = typeof s.allowRepeat === 'boolean' ? s.allowRepeat : DEFAULT_SETTINGS.allowRepeat
  const showHistory = typeof s.showHistory === 'boolean' ? s.showHistory : DEFAULT_SETTINGS.showHistory
  const edgeMargin: EdgeMargin = (EDGE_MARGINS as readonly string[]).includes(String(s.edgeMargin))
    ? (s.edgeMargin as EdgeMargin)
    : DEFAULT_SETTINGS.edgeMargin
  const alwaysOnTop = typeof s.alwaysOnTop === 'boolean' ? s.alwaysOnTop : DEFAULT_SETTINGS.alwaysOnTop
  const theme = sanitizeTheme(s.theme)
  const presetId = String(s.presetId ?? DEFAULT_PRESET_ID).slice(0, 80)
  const boardDisplay: 'auto' | number = Number.isFinite(Number(s.boardDisplay)) && s.boardDisplay !== 'auto' ? Number(s.boardDisplay) : 'auto'
  const language: LanguageSetting = (LANGUAGES as readonly string[]).includes(String(s.language)) ? (s.language as LanguageSetting) : 'auto'
  return { from, to, durationSec, teams, animation, allowRepeat, showHistory, edgeMargin, alwaysOnTop, theme, presetId, boardDisplay, language }
}

export function loadSettings(): Settings {
  try {
    return sanitize(JSON.parse(readFileSync(filePath(), 'utf8')))
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(input: Partial<Settings>): Settings {
  const s = sanitize(input)
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(filePath(), JSON.stringify(s, null, 2), 'utf8')
  } catch (e) {
    console.error('Не удалось сохранить настройки:', e)
  }
  return s
}
