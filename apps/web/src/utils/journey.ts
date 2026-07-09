import { dateLocale } from './labels'

const SOURCE_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/

export const sourceDateTimeToInput = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  if (!trimmed) return ''

  const sourceMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/)
  if (sourceMatch) return `${sourceMatch[1]}T${sourceMatch[2]}`

  const date = new Date(trimmed)
  if (!Number.isFinite(date.getTime())) return ''
  return date.toISOString().slice(0, 16)
}

export const dateTimeInputToSourceIso = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null

  const match = trimmed.match(SOURCE_DATE_TIME_PATTERN)
  if (!match) return null

  const [, datePart, hour, minute, second = '00', millisecond = ''] = match
  return `${datePart}T${hour}:${minute}:${second}.${millisecond.padEnd(3, '0') || '000'}Z`
}

export const formatSourceDateTime = (value: string | null | undefined, locale = 'de') => {
  const inputValue = sourceDateTimeToInput(value)
  const match = inputValue.match(SOURCE_DATE_TIME_PATTERN)
  if (!match) return '-'

  const [, datePart, hour, minute] = match
  const [year, month, day] = datePart.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day, Number(hour), Number(minute)))
  if (!Number.isFinite(date.getTime())) return '-'

  return new Intl.DateTimeFormat(dateLocale(locale), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(date)
}

export const nullableTrimmedText = (value: string) => {
  const trimmed = value.trim()
  return trimmed || null
}
