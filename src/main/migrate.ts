import { app } from 'electron'
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

/** Старое имя приложения: папка данных называлась по нему. Переносим содержимое при первом запуске новой версии */
const OLD_NAMES = ['QuizNaBis Randomizer']

export function migrateUserData(): void {
  const dst = app.getPath('userData')
  if (existsSync(join(dst, 'settings.json'))) return
  for (const name of OLD_NAMES) {
    const src = join(app.getPath('appData'), name)
    if (!existsSync(join(src, 'settings.json'))) continue
    try {
      for (const f of ['settings.json', 'presets.json', 'window-state.json', 'assets']) {
        const from = join(src, f)
        if (existsSync(from)) cpSync(from, join(dst, f), { recursive: true })
      }
      console.log('Данные перенесены из', src)
      return
    } catch (e) {
      console.error('Не удалось перенести данные из', src, e)
    }
  }
}
