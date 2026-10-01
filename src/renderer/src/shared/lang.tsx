import { createContext, useContext } from 'react'
import { t as translate, type Key, type Lang } from '@shared/i18n'

export const LangContext = createContext<Lang>('en')

/** Translator bound to the current UI language */
export function useT(): (key: Key, vars?: Record<string, string | number>) => string {
  const lang = useContext(LangContext)
  return (key, vars) => translate(lang, key, vars)
}
