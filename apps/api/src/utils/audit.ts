import type { Request } from 'express'
import type { Prisma } from '../generated/prisma/client.js'
import { prisma } from './prisma.js'

const sensitiveKeys = new Set(['password', 'passwordHash', 'newPassword', 'email', 'token', 'setupToken', 'discordUserId'])

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeAuditValue = (value: unknown): unknown => {
  if (value === undefined) return undefined
  if (value === null) return null
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => normalizeAuditValue(item))
  if (isRecord(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      result[key] = sensitiveKeys.has(key) ? '[redacted]' : normalizeAuditValue(child)
    }
    return result
  }
  return value
}

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'string') return value.length > 48 ? `${value.slice(0, 45)}...` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return '[changed]'
}

const valuesEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (left instanceof Date || right instanceof Date) {
    return (left instanceof Date ? left.toISOString() : left) === (right instanceof Date ? right.toISOString() : right)
  }
  if (Array.isArray(left) || Array.isArray(right)) return false
  if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return Array.from(keys).every(key => valuesEqual(left[key], right[key]))
  }
  return false
}

const buildSummary = (before: unknown, after: unknown) => {
  const beforeRecord = isRecord(before) ? before : {}
  const afterRecord = isRecord(after) ? after : {}
  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])
  const changes = Array.from(keys)
    .filter(key => !valuesEqual(beforeRecord[key], afterRecord[key]))
    .slice(0, 6)
    .map(key => `${key}: ${formatValue(beforeRecord[key])} -> ${formatValue(afterRecord[key])}`)
  if (changes.length === 0) return undefined
  const summary = changes.join('; ')
  return summary.length > 512 ? `${summary.slice(0, 509)}...` : summary
}

export const logAudit = async ({
  req,
  action,
  entityType,
  entityId,
  clanId,
  before,
  after,
  summary,
}: {
  req?: Request
  action: string
  entityType: string
  entityId?: string | null
  clanId?: string | null
  before?: unknown
  after?: unknown
  summary?: string | null
}) => {
  const beforeJson = normalizeAuditValue(before) as Prisma.InputJsonValue | undefined
  const afterJson = normalizeAuditValue(after) as Prisma.InputJsonValue | undefined
  const derivedSummary = summary ?? buildSummary(beforeJson, afterJson)

  await prisma.auditLog.create({
    data: {
      actorUserId: req?.auth?.user.id ?? null,
      clanId: clanId ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      summary: derivedSummary ?? null,
      beforeJson: beforeJson === undefined ? undefined : beforeJson,
      afterJson: afterJson === undefined ? undefined : afterJson,
    },
  })
}
