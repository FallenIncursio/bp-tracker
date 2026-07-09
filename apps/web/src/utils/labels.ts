import { gameDataLocaleFor, intlLocaleFor } from '../i18n/locales'

type LocalizedTranslation = {
  locale?: string | null
  name?: string | null
}

export const dateLocale = (locale: string) => intlLocaleFor(locale)

const translationForLocale = (translations: LocalizedTranslation[] | null | undefined, locale: string) => {
  const normalizedLocale = locale.trim().toLowerCase()
  return translations?.find(translation => translation.locale?.toLowerCase() === normalizedLocale)?.name?.trim()
}

export const localizedText = (
  deValue: string | null | undefined,
  enValue: string | null | undefined,
  locale = 'de',
  fallback = '-',
  translations?: LocalizedTranslation[] | null
) => {
  const exactTranslation = translationForLocale(translations, locale)
  if (exactTranslation) return exactTranslation

  const mappedLocale = gameDataLocaleFor(locale)
  const mappedTranslation = translationForLocale(translations, mappedLocale)
  if (mappedTranslation) return mappedTranslation

  const de = deValue?.trim()
  const en = enValue?.trim()
  if (mappedLocale === 'en') return en || de || fallback
  return de || en || fallback
}

export const localizedName = (
  item:
    | { canonicalName?: string | null; nameDe?: string | null; nameEn?: string | null; translations?: LocalizedTranslation[] | null }
    | null
    | undefined,
  locale = 'de',
  fallback = '-'
) => {
  if (!item) return fallback
  return localizedText(item.nameDe ?? item.canonicalName, item.nameEn, locale, fallback, item.translations)
}

export const formatDateTime = (value: string | Date | null | undefined, locale = 'de') => {
  if (!value) return '-'
  return new Intl.DateTimeFormat(dateLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}
