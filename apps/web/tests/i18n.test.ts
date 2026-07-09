import { afterEach, describe, expect, it } from 'vitest'
import { gameDataLocaleFor, i18n, localeOptions, setLocalePreference, supportedLocales } from '../src/i18n'

describe('i18n locales', () => {
  afterEach(() => {
    setLocalePreference('de')
    localStorage.clear()
  })

  it('exposes German, English and Spanish locale options', () => {
    expect(supportedLocales).toEqual(['de', 'en', 'es'])
    expect(localeOptions).toEqual([
      { value: 'de', label: 'DE', nativeName: 'Deutsch' },
      { value: 'en', label: 'EN', nativeName: 'English' },
      { value: 'es', label: 'ES', nativeName: 'Español' },
    ])
  })

  it('switches to Spanish UI messages', () => {
    setLocalePreference('es')

    expect(document.documentElement.lang).toBe('es')
    expect(localStorage.getItem('bp-tracker:locale')).toBe('es')
    expect(i18n.global.t('nav.blueprints')).toBe('Planos')
    expect(i18n.global.t('sirius.journeyTitle')).toBe('Ruta del clan')
    expect(i18n.global.t('checker.title')).toBe('Comprobador de planos')
  })

  it('maps unsupported game data locales back to German data labels', () => {
    expect(gameDataLocaleFor('tr')).toBe('de')
  })

  it('keeps German About credits fully localized', () => {
    const credits = i18n.global.tm('about.credits.items') as Array<{ text: string }>

    expect(credits.map(credit => credit.text)).toContain(
      'Community-gepflegte Referenzdaten zur Normalisierung der Standarddaten.'
    )
    expect(credits.map(credit => credit.text).join(' ')).not.toContain('Community-maintained')
  })

  it('keeps German UI terminology localized for common admin and roadmap labels', () => {
    const values: string[] = []
    const collectValues = (value: unknown) => {
      if (typeof value === 'string') {
        values.push(value)
        return
      }
      if (Array.isArray(value)) {
        value.forEach(collectValues)
        return
      }
      if (value && typeof value === 'object') {
        Object.values(value).forEach(collectValues)
      }
    }

    collectValues(i18n.global.getLocaleMessage('de'))

    expect(values.join(' ')).not.toMatch(
      /\b(Member|User|Entity|Actor|Summary|Channel ID|Discord Server ID|Inbox|Setup Token|Custom|Missing-|Stop|Stops)\b/
    )
    expect(i18n.global.t('admin.auditEntity')).toBe('Objekt')
    expect(i18n.global.t('admin.auditActor')).toBe('Akteur')
    expect(i18n.global.t('account.inboxNav')).toBe('Posteingang')
    expect(i18n.global.t('slot.CUSTOM')).toBe('Benutzerdefiniert')
  })

  it('localizes the Spanish audit actor label', () => {
    setLocalePreference('es')

    expect(i18n.global.t('admin.auditActor')).toBe('Autor')
  })
})
