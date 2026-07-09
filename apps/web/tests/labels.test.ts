import { describe, expect, it } from 'vitest'
import { dateLocale, formatDateTime, localizedName, localizedText } from '../src/utils/labels'

describe('label utilities', () => {
  it('maps app locales to Intl locales', () => {
    expect(dateLocale('en')).toBe('en-US')
    expect(dateLocale('de')).toBe('de-DE')
    expect(dateLocale('es')).toBe('es-ES')
    expect(dateLocale('tr')).toBe('de-DE')
  })

  it('formats dates and empty values', () => {
    expect(formatDateTime(null)).toBe('-')
    expect(formatDateTime(undefined)).toBe('-')
    expect(formatDateTime('2026-07-09T20:00:00.000Z', 'en')).toContain('2026')
    expect(formatDateTime('2026-07-09T20:00:00.000Z', 'es')).toContain('2026')
    expect(formatDateTime(new Date('2026-07-09T20:00:00.000Z'), 'de')).toContain('2026')
  })

  it('selects localized text with locale-aware fallbacks', () => {
    expect(localizedText(' Sirius Schild ', ' Sirius Shield ', 'en')).toBe('Sirius Shield')
    expect(localizedText(' Sirius Schild ', ' Sirius Shield ', 'es')).toBe('Sirius Shield')
    expect(localizedText(' Sirius Schild ', ' Sirius Shield ', 'es', '-', [{ locale: 'es', name: 'Sirius Escudo' }])).toBe('Sirius Escudo')
    expect(localizedText('Sirius Schild', 'Sirius Shield', 'es', '-', [{ locale: 'en', name: 'Translated Shield' }])).toBe(
      'Translated Shield'
    )
    expect(localizedText('Sirius Schild', null, 'en')).toBe('Sirius Schild')
    expect(localizedText('Sirius Schild', null, 'es')).toBe('Sirius Schild')
    expect(localizedText('', '', 'en', 'Fallback')).toBe('Fallback')
    expect(localizedText('Sirius Schild', 'Sirius Shield', 'de')).toBe('Sirius Schild')
    expect(localizedText(null, 'Sirius Shield', 'de')).toBe('Sirius Shield')
    expect(localizedText(null, null, 'de', 'Fallback')).toBe('Fallback')
  })

  it('selects localized entity names from explicit names or canonical fallback', () => {
    expect(localizedName(null)).toBe('-')
    expect(localizedName(undefined, 'en', 'Fallback')).toBe('Fallback')
    expect(localizedName({ canonicalName: 'Sirius Schild', nameDe: 'Sirius Schild', nameEn: 'Sirius Shield' }, 'en')).toBe('Sirius Shield')
    expect(localizedName({ canonicalName: 'Sirius Schild', nameDe: 'Sirius Schild', nameEn: 'Sirius Shield' }, 'es')).toBe('Sirius Shield')
    expect(
      localizedName(
        {
          canonicalName: 'Sirius Schild',
          nameDe: 'Sirius Schild',
          nameEn: 'Sirius Shield',
          translations: [{ locale: 'es', name: 'Sirius Escudo' }],
        },
        'es'
      )
    ).toBe('Sirius Escudo')
    expect(localizedName({ canonicalName: 'Sirius Schild', nameDe: null, nameEn: null }, 'de')).toBe('Sirius Schild')
  })
})
