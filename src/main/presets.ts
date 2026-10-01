import { app, dialog, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { PRESET_FILE_EXT, PRESET_FILE_FORMAT, sanitizeTheme, type Preset, type Theme } from '@shared/theme'
import { assetPathFromUrl, storeAssetBuffer } from './assets'
import { QUIZNABIS_PRESET } from './seed'

function filePath(): string {
  return join(app.getPath('userData'), 'presets.json')
}

interface PresetsFile {
  presets?: unknown
  /** «КВИЗ на БИС» добавляется один раз; после удаления пользователем не возвращается */
  seededQuiznabis?: boolean
}

function readFile(): PresetsFile {
  try {
    return JSON.parse(readFileSync(filePath(), 'utf8')) as PresetsFile
  } catch {
    return {}
  }
}

function readUser(): Preset[] {
  try {
    const raw = readFile()
    if (!Array.isArray(raw.presets)) return []
    return raw.presets
      .filter((p): p is Preset => !!p && typeof p === 'object' && typeof (p as Preset).id === 'string')
      .map((p) => ({ id: p.id, name: String(p.name ?? '').trim().slice(0, 60) || 'Без названия', theme: sanitizeTheme(p.theme) }))
  } catch {
    return []
  }
}

function writeUser(presets: Preset[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    const file: PresetsFile = { ...readFile(), presets, seededQuiznabis: true }
    writeFileSync(filePath(), JSON.stringify(file, null, 2), 'utf8')
  } catch (e) {
    console.error('Не удалось сохранить пресеты:', e)
  }
}

/** Один раз добавляет «КВИЗ на БИС» - обычный редактируемый пресет (при первом запуске или обновлении) */
export function seedPresets(): void {
  if (readFile().seededQuiznabis) return
  const user = readUser()
  if (!user.some((p) => p.id === QUIZNABIS_PRESET.id)) user.unshift(QUIZNABIS_PRESET)
  writeUser(user)
}

export function listPresets(): Preset[] {
  return readUser()
}

/** Создаёт новый пресет или обновляет существующий с таким id */
export function savePreset(input: { id?: string; name: string; theme: Theme }): Preset[] {
  const user = readUser()
  const name = String(input.name ?? '').trim().slice(0, 60) || 'Без названия'
  const theme = sanitizeTheme(input.theme)
  const existing = input.id ? user.find((p) => p.id === input.id) : undefined
  if (existing) {
    existing.name = name
    existing.theme = theme
  } else {
    user.push({ id: randomUUID(), name, theme })
  }
  writeUser(user)
  return listPresets()
}

export function deletePreset(id: string): Preset[] {
  writeUser(readUser().filter((p) => p.id !== id))
  return listPresets()
}

/* ---------- экспорт / импорт файлом (.rpreset = zip: preset.json + assets/) ---------- */

interface PresetFile {
  format: string
  version: number
  name: string
  theme: Theme
}

const ASSET_FIELDS: Array<{ kind: keyof Theme; url: keyof Theme; only?: string }> = [
  { kind: 'fontKind', url: 'fontId', only: 'file' },
  { kind: 'patternKind', url: 'patternUrl', only: 'file' },
  { kind: 'logoKind', url: 'logoUrl', only: 'file' }
]

/** Сохраняет пресет в архив вместе с файлами шрифта/паттерна/логотипа; false - отмена или ошибка */
export async function exportPreset(win: BrowserWindow | null, id: string): Promise<boolean> {
  const preset = readUser().find((p) => p.id === id)
  if (!preset) return false
  const safe = preset.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'preset'
  const opts = {
    title: 'Сохранить пресет',
    defaultPath: join(app.getPath('documents'), `${safe}.${PRESET_FILE_EXT}`),
    filters: [{ name: 'Пресет рандомайзера', extensions: [PRESET_FILE_EXT] }]
  }
  // RANDOMIZER_PRESET_PATH - обход диалога для автотестов
  const forced = process.env['RANDOMIZER_PRESET_PATH']
  const res = forced
    ? { canceled: false, filePath: forced }
    : win
      ? await dialog.showSaveDialog(win, opts)
      : await dialog.showSaveDialog(opts)
  if (res.canceled || !res.filePath) return false
  const zip = new AdmZip()
  const theme: Record<string, unknown> = { ...preset.theme }
  for (const f of ASSET_FIELDS) {
    if (theme[f.kind] !== f.only) continue
    const path = assetPathFromUrl(String(theme[f.url]))
    if (!path) {
      // файла нет на диске - в архиве поле обнуляем, чтобы импорт не ссылался в пустоту
      theme[f.kind] = f.kind === 'fontKind' ? 'builtin' : 'none'
      theme[f.url] = f.kind === 'fontKind' ? 'montserrat' : ''
      continue
    }
    const entry = `assets/${basename(path)}`
    zip.addLocalFile(path, 'assets')
    theme[f.url] = entry
  }
  const file: PresetFile = { format: PRESET_FILE_FORMAT, version: 1, name: preset.name, theme: theme as unknown as Theme }
  zip.addFile('preset.json', Buffer.from(JSON.stringify(file, null, 2), 'utf8'))
  try {
    zip.writeZip(res.filePath)
    return true
  } catch (e) {
    console.error('Не удалось записать пресет:', e)
    return false
  }
}

/** Читает архив пресета, кладёт его файлы в папку данных и добавляет пресет в список */
export async function importPreset(win: BrowserWindow | null): Promise<{ presets: Preset[]; imported: Preset | null; error?: string }> {
  const opts = {
    title: 'Открыть пресет',
    properties: ['openFile' as const],
    filters: [{ name: 'Пресет рандомайзера', extensions: [PRESET_FILE_EXT, 'zip'] }]
  }
  const forced = process.env['RANDOMIZER_PRESET_PATH']
  const res = forced
    ? { canceled: false, filePaths: [forced] }
    : win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
  const src = res.filePaths[0]
  if (res.canceled || !src) return { presets: listPresets(), imported: null }
  try {
    const zip = new AdmZip(src)
    const entry = zip.getEntry('preset.json')
    if (!entry) throw new Error('в архиве нет preset.json')
    const file = JSON.parse(entry.getData().toString('utf8')) as PresetFile
    if (file.format !== PRESET_FILE_FORMAT) throw new Error('это не файл пресета рандомайзера')
    const theme: Record<string, unknown> = { ...(file.theme ?? {}) }
    for (const f of ASSET_FIELDS) {
      if (theme[f.kind] !== f.only) continue
      const ref = String(theme[f.url] ?? '')
      const e = ref.startsWith('assets/') ? zip.getEntry(ref) : null
      const stored = e ? storeAssetBuffer(e.getData(), basename(ref).replace(/^[0-9a-f]{10}-/, '')) : null
      if (stored) theme[f.url] = stored.url
      else {
        theme[f.kind] = f.kind === 'fontKind' ? 'builtin' : 'none'
        theme[f.url] = f.kind === 'fontKind' ? 'montserrat' : ''
      }
    }
    const name = String(file.name ?? basename(src, extname(src))).trim().slice(0, 60) || 'Импортированный'
    const user = readUser()
    const preset: Preset = { id: randomUUID(), name, theme: sanitizeTheme(theme as Partial<Theme>) }
    user.push(preset)
    writeUser(user)
    return { presets: listPresets(), imported: preset }
  } catch (e) {
    console.error('Не удалось импортировать пресет:', e)
    return { presets: listPresets(), imported: null, error: e instanceof Error ? e.message : String(e) }
  }
}
