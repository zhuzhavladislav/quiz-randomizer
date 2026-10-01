import { app, dialog, type BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import AdmZip from 'adm-zip'
import { PRESET_FILE_EXT, PRESET_FILE_FORMAT, sanitizeTheme, type Preset, type Theme } from '@shared/theme'
import { assetPathFromUrl, storeAssetBuffer } from './assets'
import { t, type Lang } from '@shared/i18n'

function filePath(): string {
  return join(app.getPath('userData'), 'presets.json')
}

interface PresetsFile {
  presets?: unknown
  /** Пресеты из комплекта импортируются один раз; после удаления пользователем не возвращаются */
  seededBundled?: boolean
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
      .map((p) => ({ id: p.id, name: String(p.name ?? '').trim().slice(0, 60) || 'Untitled', theme: sanitizeTheme(p.theme) }))
  } catch {
    return []
  }
}

function writeUser(presets: Preset[]): void {
  try {
    mkdirSync(app.getPath('userData'), { recursive: true })
    const file: PresetsFile = { ...readFile(), presets, seededBundled: true }
    writeFileSync(filePath(), JSON.stringify(file, null, 2), 'utf8')
  } catch (e) {
    console.error('Не удалось сохранить пресеты:', e)
  }
}

/** Папка с пресетами из комплекта (presets/*.rpreset в корне приложения) */
function bundledDir(): string {
  return join(app.getAppPath(), 'presets')
}

/** Один раз импортирует пресеты из комплекта; пресеты с уже существующим именем пропускаются */
export function seedPresets(): void {
  const file = readFile()
  if (file.seededBundled) return
  let files: string[] = []
  try {
    files = readdirSync(bundledDir()).filter((f) => f.endsWith(`.${PRESET_FILE_EXT}`)).sort()
  } catch {
    files = []
  }
  for (const f of files) {
    const path = join(bundledDir(), f)
    const existing = new Set(readUser().map((p) => p.name))
    const r = importPresetFile(path, (name) => !existing.has(name))
    if (r.error) console.error('Пресет из комплекта не импортирован:', f, r.error)
  }
  // маркер ставится даже если импортировать было нечего
  writeUser(readUser())
}

export function listPresets(): Preset[] {
  return readUser()
}

/** Создаёт новый пресет или обновляет существующий с таким id */
export function savePreset(input: { id?: string; name: string; theme: Theme }): Preset[] {
  const user = readUser()
  const name = String(input.name ?? '').trim().slice(0, 60) || 'Untitled'
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
export async function exportPreset(win: BrowserWindow | null, id: string, lang: Lang = 'en'): Promise<boolean> {
  const preset = readUser().find((p) => p.id === id)
  if (!preset) return false
  const safe = preset.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'preset'
  const opts = {
    title: t(lang, 'dlg.presetSave'),
    defaultPath: join(app.getPath('documents'), `${safe}.${PRESET_FILE_EXT}`),
    filters: [{ name: t(lang, 'dlg.presetFilter'), extensions: [PRESET_FILE_EXT] }]
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

/** Читает архив пресета, кладёт его файлы в папку данных и добавляет пресет в список.
 *  accept - фильтр по имени (чтобы не плодить дубли из комплекта) */
export function importPresetFile(src: string, accept: (name: string) => boolean = () => true, lang: Lang = 'en'): { imported: Preset | null; error?: string } {
  try {
    const zip = new AdmZip(src)
    const entry = zip.getEntry('preset.json')
    if (!entry) throw new Error(t(lang, 'preset.err.noJson'))
    const file = JSON.parse(entry.getData().toString('utf8')) as PresetFile
    if (file.format !== PRESET_FILE_FORMAT) throw new Error(t(lang, 'preset.err.format'))
    const name = String(file.name ?? basename(src, extname(src))).trim().slice(0, 60) || t(lang, 'preset.imported')
    if (!accept(name)) return { imported: null }
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
    const user = readUser()
    const preset: Preset = { id: randomUUID(), name, theme: sanitizeTheme(theme as Partial<Theme>) }
    user.push(preset)
    writeUser(user)
    return { imported: preset }
  } catch (e) {
    console.error('Не удалось импортировать пресет:', e)
    return { imported: null, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Диалог выбора файла пресета и импорт */
export async function importPreset(win: BrowserWindow | null, lang: Lang = 'en'): Promise<{ presets: Preset[]; imported: Preset | null; error?: string }> {
  const opts = {
    title: t(lang, 'dlg.presetOpen'),
    properties: ['openFile' as const],
    filters: [{ name: t(lang, 'dlg.presetFilter'), extensions: [PRESET_FILE_EXT, 'zip'] }]
  }
  const forced = process.env['RANDOMIZER_PRESET_PATH']
  const res = forced
    ? { canceled: false, filePaths: [forced] }
    : win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts)
  const src = res.filePaths[0]
  if (res.canceled || !src) return { presets: listPresets(), imported: null }
  const r = importPresetFile(src, () => true, lang)
  return { presets: listPresets(), ...r }
}
