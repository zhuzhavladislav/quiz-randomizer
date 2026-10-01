import { useEffect, useState } from 'react'
import { CONFETTI_MAX, themesEqual, type Preset, type Theme } from '@shared/theme'
import { FontPicker, loadSystemFonts } from './FontPicker'
import { Section } from './Section'

interface Props {
  theme: Theme
  presetId: string
  onChange: (patch: Partial<Theme>) => void
  onApplyPreset: (p: Preset) => void
  onClose: () => void
}

const ICONS: Record<string, string> = {
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z',
  save: 'M5 3h11l3 3v15H5zm2 2v5h8V5zm1 1h2v3H8zM7 13v6h10v-6z',
  undo: 'M12 5a8 8 0 0 1 8 8h-2a6 6 0 0 0-6-6H8.8l2.6 2.6-1.4 1.4L5 6l5-5 1.4 1.4L8.8 5z',
  export: 'M12 2l5.5 5.5-1.4 1.4L13 5.8V16h-2V5.8L7.9 8.9 6.5 7.5zM4 19h16v2H4z',
  import: 'M11 3h2v10.2l3.1-3.1 1.4 1.4L12 17l-5.5-5.5 1.4-1.4 3.1 3.1zM4 19h16v2H4z'
}

/** Поле hex-кода: можно набирать по буквам, в тему уходит только корректное значение */
function HexInput({ value, onChange }: { value: string; onChange: (v: string) => void }): React.JSX.Element {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const commit = (raw: string): void => {
    let v = raw.trim().toLowerCase()
    if (v && !v.startsWith('#')) v = `#${v}`
    if (/^#[0-9a-f]{3}$/.test(v)) v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`
    if (/^#[0-9a-f]{6}$/.test(v)) onChange(v)
    else setText(value)
  }
  return (
    <input
      className="color__hex"
      value={text}
      maxLength={7}
      spellCheck={false}
      onChange={(e) => {
        setText(e.target.value)
        const v = e.target.value.trim().toLowerCase()
        if (/^#[0-9a-f]{6}$/.test(v)) onChange(v)
      }}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit((e.target as HTMLInputElement).value)
      }}
    />
  )
}

function IconBtn({ title, icon, disabled, onClick }: { title: string; icon: string; disabled?: boolean; onClick: () => void }): React.JSX.Element {
  return (
    <button className="ibtn" type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
        <path fill="currentColor" d={ICONS[icon]} />
      </svg>
    </button>
  )
}

/** Панель «Оформление»: пресеты, шрифт, цвета, паттерн, логотип. Все изменения применяются на табло сразу */
export function ThemePanel({ theme, presetId, onChange, onApplyPreset, onClose }: Props): React.JSX.Element {
  const [presets, setPresets] = useState<Preset[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    void window.api.listPresets().then(setPresets)
    // Список системных шрифтов читается несколько секунд - начинаем заранее, при открытии панели
    void loadSystemFonts()
  }, [])

  const preset = presets.find((p) => p.id === presetId) ?? null
  const dirty = preset ? !themesEqual(preset.theme, theme) : true

  const saveAs = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    const list = await window.api.savePreset({ name: n, theme })
    setPresets(list)
    const created = list[list.length - 1]
    if (created) onApplyPreset(created)
    setNaming(false)
    setName('')
  }

  const updateCurrent = async (): Promise<void> => {
    if (!preset) return
    const list = await window.api.savePreset({ id: preset.id, name: preset.name, theme })
    setPresets(list)
    const updated = list.find((p) => p.id === preset.id)
    if (updated) onApplyPreset(updated)
  }

  const remove = async (): Promise<void> => {
    if (!preset) return
    const list = await window.api.deletePreset(preset.id)
    setPresets(list)
    setConfirmDelete(false)
    if (list[0]) onApplyPreset(list[0])
  }

  const exportFile = async (): Promise<void> => {
    if (!preset) return
    if (dirty) await updateCurrent()
    const ok = await window.api.exportPreset(preset.id)
    setNotice(ok ? `Пресет «${preset.name}» сохранён в файл` : null)
  }

  const importFile = async (): Promise<void> => {
    const r = await window.api.importPreset()
    setPresets(r.presets)
    if (r.imported) {
      onApplyPreset(r.imported)
      setNotice(`Импортирован пресет «${r.imported.name}»`)
    } else if (r.error) setNotice(`Не удалось импортировать: ${r.error}`)
  }

  const pickImage = async (target: 'pattern' | 'logo'): Promise<void> => {
    const a = await window.api.pickAsset('image')
    if (!a) return
    if (target === 'pattern') onChange({ patternKind: 'file', patternUrl: a.url, patternName: a.name })
    else onChange({ logoKind: 'file', logoUrl: a.url, logoName: a.name })
  }

  const color = (key: 'bgColor' | 'digitColor' | 'textColor' | 'shadowColor'): React.JSX.Element => (
    <div className="color">
      <input type="color" value={theme[key]} aria-label="Выбрать цвет" onChange={(e) => onChange({ [key]: e.target.value })} />
      <HexInput value={theme[key]} onChange={(v) => onChange({ [key]: v })} />
    </div>
  )

  return (
    <div className="panel">
      <div className="panel__head">
        <span className="panel__title">Оформление</span>
        <button className="panel__close" type="button" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>

      <div className="panel__body">
        {/* ---- пресеты ---- */}
        <Section id="t-presets" title="Пресеты" meta={dirty && preset ? 'текущий изменён' : undefined}>
          <div className="form">
            <select
              id="preset"
              value={preset ? preset.id : ''}
              onChange={(e) => {
                const p = presets.find((x) => x.id === e.target.value)
                if (p) onApplyPreset(p)
              }}
            >
              {!preset && <option value="">- свой вариант -</option>}
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {naming ? (
            <div className="toolbar">
              <input
                className="preset-name"
                autoFocus
                placeholder="Название нового пресета"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void saveAs()
                  if (e.key === 'Escape') setNaming(false)
                }}
              />
              <button className="btn" type="button" disabled={!name.trim()} onClick={() => void saveAs()}>
                Сохранить
              </button>
              <button className="btn" type="button" onClick={() => setNaming(false)}>
                Отмена
              </button>
            </div>
          ) : confirmDelete && preset ? (
            <div className="toolbar">
              <span className="toolbar__text">Удалить пресет «{preset.name}»?</span>
              <button className="btn btn--danger" type="button" onClick={() => void remove()}>
                Удалить
              </button>
              <button className="btn" type="button" onClick={() => setConfirmDelete(false)}>
                Отмена
              </button>
            </div>
          ) : (
            <div className="toolbar">
              <div className="igroup">
                <IconBtn title="Сохранить как новый пресет" onClick={() => setNaming(true)} icon="plus" />
                <IconBtn title="Обновить текущий пресет" disabled={!preset || !dirty} onClick={() => void updateCurrent()} icon="save" />
                <IconBtn title="Вернуть сохранённые значения пресета" disabled={!preset || !dirty} onClick={() => preset && onApplyPreset(preset)} icon="undo" />
              </div>
              <div className="igroup">
                <IconBtn title="Экспорт пресета в файл" disabled={!preset} onClick={() => void exportFile()} icon="export" />
                <IconBtn title="Импорт пресета из файла" onClick={() => void importFile()} icon="import" />
              </div>
              <button className="btn btn--danger toolbar__right" type="button" disabled={!preset} onClick={() => setConfirmDelete(true)}>
                Удалить
              </button>
            </div>
          )}
          {notice && <div className="hint">{notice}</div>}
        </Section>

        {/* ---- текст и шрифт ---- */}
        <Section id="t-text" title="Текст">
          <div className="form">
            <label className="form__label" htmlFor="ttitle">
              Название
            </label>
            <input id="ttitle" className="text" value={theme.title} maxLength={60} placeholder="Показывается, если нет логотипа" onChange={(e) => onChange({ title: e.target.value })} />
            <span className="form__label">Шрифт</span>
            <FontPicker theme={theme} onChange={onChange} />
          </div>
        </Section>

        {/* ---- цвета ---- */}
        <Section id="t-colors" title="Цвета">
          <div className="row row--2">
            <div className="field">
              <label>Фон</label>
              {color('bgColor')}
            </div>
            <div className="field">
              <label>Цифры</label>
              {color('digitColor')}
            </div>
            <div className="field">
              <label>Текст</label>
              {color('textColor')}
            </div>
            <div className="field">
              <label>Тень цифр</label>
              {color('shadowColor')}
            </div>
          </div>
          <div className="form">
            <span className="form__label">Плотность тени</span>
            <label className="slider">
              <input type="range" min={0} max={100} value={Math.round(theme.shadowOpacity * 100)} onChange={(e) => onChange({ shadowOpacity: Number(e.target.value) / 100 })} />
              <span className="slider__value">{Math.round(theme.shadowOpacity * 100)}%</span>
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={theme.bgGlow} onChange={(e) => onChange({ bgGlow: e.target.checked })} />
            <span>Светлое пятно в центре фона</span>
          </label>
        </Section>

        {/* ---- конфетти ---- */}
        <Section id="t-confetti" title="Конфетти" meta={theme.confetti ? `${theme.confettiColors.length} цв.` : 'выкл'}>
          <label className="check">
            <input type="checkbox" checked={theme.confetti} onChange={(e) => onChange({ confetti: e.target.checked })} />
            <span>Конфетти при объявлении победителя</span>
          </label>
          {theme.confetti && (
            <div className="row row--2">
              {theme.confettiColors.map((c, i) => (
                <div className="color" key={i}>
                  <input
                    type="color"
                    value={c}
                    aria-label="Выбрать цвет"
                    onChange={(e) => onChange({ confettiColors: theme.confettiColors.map((x, j) => (j === i ? e.target.value : x)) })}
                  />
                  <HexInput value={c} onChange={(v) => onChange({ confettiColors: theme.confettiColors.map((x, j) => (j === i ? v : x)) })} />
                  <button
                    type="button"
                    className="color__remove"
                    title="Убрать цвет"
                    disabled={theme.confettiColors.length <= 1}
                    onClick={() => onChange({ confettiColors: theme.confettiColors.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </div>
              ))}
              {theme.confettiColors.length < CONFETTI_MAX && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => onChange({ confettiColors: [...theme.confettiColors, theme.digitColor] })}
                >
                  + цвет
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ---- паттерн ---- */}
        <Section id="t-pattern" title="Паттерн на фоне" meta={theme.patternKind === 'none' ? 'нет' : theme.patternName}>
          <div className="form">
            <span className="form__label">Картинка</span>
            <div className="form__row">
              <select
                value={theme.patternKind}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'file') void pickImage('pattern')
                  else onChange({ patternKind: v as Theme['patternKind'] })
                }}
              >
                <option value="none">Нет</option>
                <option value="file">{theme.patternKind === 'file' && theme.patternName ? theme.patternName : 'Файл…'}</option>
              </select>
              {theme.patternKind === 'file' && (
                <button className="btn" type="button" onClick={() => void pickImage('pattern')}>
                  Заменить…
                </button>
              )}
            </div>
            {theme.patternKind !== 'none' && (
              <>
                <span className="form__label">Прозрачность</span>
                <label className="slider">
                  <input type="range" min={0} max={100} value={Math.round(theme.patternOpacity * 100)} onChange={(e) => onChange({ patternOpacity: Number(e.target.value) / 100 })} />
                  <span className="slider__value">{Math.round(theme.patternOpacity * 100)}%</span>
                </label>
                <span className="form__label">Размер</span>
                <label className="slider">
                  <input type="range" min={25} max={300} step={5} value={Math.round(theme.patternScale * 100)} onChange={(e) => onChange({ patternScale: Number(e.target.value) / 100 })} />
                  <span className="slider__value">{Math.round(theme.patternScale * 100)}%</span>
                </label>
              </>
            )}
          </div>
        </Section>

        {/* ---- логотип ---- */}
        <Section id="t-logo" title="Логотип" meta={theme.logoKind === 'none' ? 'нет' : theme.logoName}>
          <div className="form">
            <span className="form__label">Картинка</span>
            <div className="form__row">
              <select
                value={theme.logoKind}
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'file') void pickImage('logo')
                  else onChange({ logoKind: v as Theme['logoKind'] })
                }}
              >
                <option value="none">Нет (показывать название)</option>
                <option value="file">{theme.logoKind === 'file' && theme.logoName ? theme.logoName : 'Файл…'}</option>
              </select>
              {theme.logoKind === 'file' && (
                <button className="btn" type="button" onClick={() => void pickImage('logo')}>
                  Заменить…
                </button>
              )}
            </div>
            {theme.logoKind !== 'none' && (
              <>
                <span className="form__label">Размер</span>
                <label className="slider">
                  <input type="range" min={50} max={200} step={5} value={Math.round(theme.logoScale * 100)} onChange={(e) => onChange({ logoScale: Number(e.target.value) / 100 })} />
                  <span className="slider__value">{Math.round(theme.logoScale * 100)}%</span>
                </label>
              </>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
