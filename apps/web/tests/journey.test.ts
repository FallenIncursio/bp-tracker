import { describe, expect, it } from 'vitest'
import { dateTimeInputToSourceIso, formatSourceDateTime, nullableTrimmedText, sourceDateTimeToInput } from '../src/utils/journey'

describe('journey utilities', () => {
  it('keeps source timestamps stable for roadmap date-time inputs', () => {
    expect(sourceDateTimeToInput('2026-07-10T09:03:00.000Z')).toBe('2026-07-10T09:03')
    expect(sourceDateTimeToInput('2026-07-10T09:03:00+02:00')).toBe('2026-07-10T09:03')
  })

  it('serializes roadmap date-time inputs without applying browser timezone offsets', () => {
    expect(dateTimeInputToSourceIso('2026-07-10T09:03')).toBe('2026-07-10T09:03:00.000Z')
    expect(dateTimeInputToSourceIso('')).toBeNull()
    expect(dateTimeInputToSourceIso('not a date')).toBeNull()
  })

  it('formats roadmap times without shifting the displayed clock value', () => {
    expect(formatSourceDateTime(null)).toBe('-')
    expect(formatSourceDateTime('2026-07-10T09:03:00.000Z', 'de')).toContain('09:03')
  })

  it('normalizes empty text fields to nullable payload values', () => {
    expect(nullableTrimmedText('  Neue Notiz  ')).toBe('Neue Notiz')
    expect(nullableTrimmedText('   ')).toBeNull()
  })
})
