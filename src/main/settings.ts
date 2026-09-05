import { app } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ANIMATIONS, DEFAULT_SETTINGS, EDGE_MARGINS, type Animation, type EdgeMargin, type Settings } from '@shared/types'

function filePath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function sanitize(input: Partial<Settings> | null | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(input ?? {}) }
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
  return { from, to, durationSec, teams, animation, allowRepeat, showHistory, edgeMargin, alwaysOnTop }
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
