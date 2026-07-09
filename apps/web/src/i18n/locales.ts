export const supportedLocales = ['de', 'en', 'es'] as const
export type SupportedLocale = (typeof supportedLocales)[number]
export type GameDataLocale = 'de' | 'en'

export const localeDefinitions: Record<
  SupportedLocale,
  {
    label: string
    nativeName: string
    intlLocale: string
    gameDataLocale: GameDataLocale
  }
> = {
  de: {
    label: 'DE',
    nativeName: 'Deutsch',
    intlLocale: 'de-DE',
    gameDataLocale: 'de',
  },
  en: {
    label: 'EN',
    nativeName: 'English',
    intlLocale: 'en-US',
    gameDataLocale: 'en',
  },
  es: {
    label: 'ES',
    nativeName: 'Español',
    intlLocale: 'es-ES',
    gameDataLocale: 'en',
  },
}

export const localeOptions = supportedLocales.map(locale => ({
  value: locale,
  label: localeDefinitions[locale].label,
  nativeName: localeDefinitions[locale].nativeName,
}))

export const isSupportedLocale = (value: string | null): value is SupportedLocale =>
  Boolean(value && supportedLocales.includes(value as SupportedLocale))

export const intlLocaleFor = (locale: string) =>
  isSupportedLocale(locale) ? localeDefinitions[locale].intlLocale : localeDefinitions.de.intlLocale

export const gameDataLocaleFor = (locale: string): GameDataLocale =>
  isSupportedLocale(locale) ? localeDefinitions[locale].gameDataLocale : localeDefinitions.de.gameDataLocale
