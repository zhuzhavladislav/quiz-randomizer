import { app, dialog, net, protocol, type BrowserWindow } from 'electron'
import { copyFileSync, createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { ASSET_URL_PREFIX } from '@shared/theme'
import type { PickedAsset } from '@shared/types'
import { t, type Lang } from '@shared/i18n'

/**
 * Файлы пользователя (шрифты, паттерны, логотипы) копируются в userData/assets и раздаются табло
 * по схеме asset://local/<имя>. Так рендерер с sandbox и CSP получает к ним доступ без file://.
 */

const SCHEME = 'asset'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

export function assetsDir(): string {
  return join(app.getPath('userData'), 'assets')
}

export const ASSET_EXTENSIONS = Object.keys(MIME)

/** Локальный путь файла по asset-URL; null - если URL чужой или файла нет */
export function assetPathFromUrl(url: string): string | null {
  if (!url.startsWith(ASSET_URL_PREFIX)) return null
  const name = basename(decodeURIComponent(url.slice(ASSET_URL_PREFIX.length)))
  const file = join(assetsDir(), name)
  return name && existsSync(file) ? file : null
}

function safeBaseName(original: string): string {
  return basename(original, extname(original))
    .replace(/[^\p{L}\p{N}_-]+/gu, '_')
    .slice(0, 40)
}

/** Кладёт содержимое в папку данных под именем <hash>-<имя>.<ext>; возвращает asset-URL */
export function storeAssetBuffer(buf: Buffer, originalName: string): PickedAsset | null {
  const ext = extname(originalName).toLowerCase()
  if (!MIME[ext]) return null
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 10)
  const name = `${hash}-${safeBaseName(originalName)}${ext}`
  mkdirSync(assetsDir(), { recursive: true })
  const dst = join(assetsDir(), name)
  if (!existsSync(dst)) writeFileSync(dst, buf)
  return { url: `${ASSET_URL_PREFIX}${encodeURIComponent(name)}`, name: basename(originalName) }
}

/** Вызывать до app.whenReady() */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
  ])
}

/** Вызывать после app.whenReady() */
export function serveAssets(): void {
  protocol.handle(SCHEME, async (request) => {
    const name = basename(decodeURIComponent(new URL(request.url).pathname))
    const file = join(assetsDir(), name)
    if (!name || !existsSync(file)) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).toString())
    // Шрифты браузер запрашивает в CORS-режиме, поэтому нужен Access-Control-Allow-Origin
    return new Response(res.body, {
      status: res.status,
      headers: {
        'Content-Type': MIME[extname(name).toLowerCase()] ?? 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'max-age=31536000'
      }
    })
  })
}

function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha1')
    createReadStream(path).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

/** Показывает диалог выбора файла и копирует его в папку данных; null - отмена */
export async function pickAsset(win: BrowserWindow | null, kind: 'font' | 'image', lang: Lang = 'en'): Promise<PickedAsset | null> {
  const filters =
    kind === 'font'
      ? [{ name: t(lang, 'dlg.fonts'), extensions: ['ttf', 'otf', 'woff', 'woff2'] }]
      : [{ name: t(lang, 'dlg.images'), extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }]
  const opts = { title: t(lang, kind === 'font' ? 'dlg.font' : 'dlg.image'), properties: ['openFile' as const], filters }
  const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  const src = result.filePaths[0]
  if (result.canceled || !src) return null
  const ext = extname(src).toLowerCase()
  if (!MIME[ext]) return null
  const name = `${(await hashFile(src)).slice(0, 10)}-${safeBaseName(src)}${ext}`
  mkdirSync(assetsDir(), { recursive: true })
  const dst = join(assetsDir(), name)
  if (!existsSync(dst)) copyFileSync(src, dst)
  return { url: `${ASSET_URL_PREFIX}${encodeURIComponent(name)}`, name: basename(src) }
}
