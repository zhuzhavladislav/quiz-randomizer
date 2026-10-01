import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import quiznabisLogo from '../../resources/quiznabis-logo.png?asset'
import quiznabisPattern from '../../resources/quiznabis-pattern.webp?asset'
import { ASSET_URL_PREFIX, DEFAULT_THEME, QUIZNABIS_PRESET_ID, type Preset } from '@shared/theme'
import { assetsDir } from './assets'

/** Файлы «КВИЗ на БИС», которые кладутся в userData/assets при первом запуске */
export const QUIZNABIS_ASSETS = {
  logo: { name: 'quiznabis-logo.png', url: `${ASSET_URL_PREFIX}quiznabis-logo.png`, src: quiznabisLogo },
  pattern: { name: 'quiznabis-pattern.webp', url: `${ASSET_URL_PREFIX}quiznabis-pattern.webp`, src: quiznabisPattern }
}

export const QUIZNABIS_PRESET: Preset = {
  id: QUIZNABIS_PRESET_ID,
  name: 'КВИЗ на БИС',
  theme: {
    ...DEFAULT_THEME,
    title: 'КВИЗ на БИС',
    bgColor: '#00148b',
    digitColor: '#ffb829',
    textColor: '#ffffff',
    confettiColors: ['#ffb829', '#ffdd2a', '#ffffff', '#8fa3ff'],
    patternKind: 'file',
    patternUrl: QUIZNABIS_ASSETS.pattern.url,
    patternName: QUIZNABIS_ASSETS.pattern.name,
    logoKind: 'file',
    logoUrl: QUIZNABIS_ASSETS.logo.url,
    logoName: QUIZNABIS_ASSETS.logo.name
  }
}

/** Копирует файлы «КВИЗ на БИС» в папку данных, если их там ещё нет */
export function seedBundledAssets(): void {
  mkdirSync(assetsDir(), { recursive: true })
  for (const a of [QUIZNABIS_ASSETS.logo, QUIZNABIS_ASSETS.pattern]) {
    const dst = join(assetsDir(), a.name)
    if (!existsSync(dst)) {
      try {
        copyFileSync(a.src, dst)
      } catch (e) {
        console.error('Не удалось скопировать ресурс', a.name, e)
      }
    }
  }
}
