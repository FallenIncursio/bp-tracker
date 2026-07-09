import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../utils/prisma.js'
import { asyncHandler } from '../utils/http.js'
import { requireAdmin } from '../auth/auth.middleware.js'

export const auditRouter = Router()

const firstQueryValue = (value: unknown) => (Array.isArray(value) ? value[0] : value)
const queryString = (value: unknown) => {
  const raw = firstQueryValue(value)
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

const queryNumber = (value: unknown) => {
  const raw = queryString(value)
  return raw ? Number(raw) : undefined
}

const auditQuerySchema = z.object({
  clanId: z.string().uuid().optional(),
  actorUserId: z.string().uuid().optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.string().trim().max(120).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.number().int().min(1).max(1000).default(1),
  limit: z.number().int().min(1).max(100).default(25),
})

auditRouter.get(
  '/',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const query = auditQuerySchema.parse({
      clanId: queryString(req.query.clanId),
      actorUserId: queryString(req.query.actorUserId),
      action: queryString(req.query.action),
      entityType: queryString(req.query.entityType),
      search: queryString(req.query.search),
      page: queryNumber(req.query.page),
      limit: queryNumber(req.query.limit),
    })

    const where = {
      ...(query.clanId ? { clanId: query.clanId } : {}),
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.entityType ? { entityType: { contains: query.entityType, mode: 'insensitive' as const } } : {}),
      ...(query.search
        ? {
            OR: [
              { action: { contains: query.search, mode: 'insensitive' as const } },
              { entityType: { contains: query.search, mode: 'insensitive' as const } },
              { summary: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [logs, total] = await prisma.$transaction([
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.auditLog.count({ where }),
    ])

    const actorIds = Array.from(new Set(logs.map(log => log.actorUserId).filter((id): id is string => Boolean(id))))
    const actors = actorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, displayName: true, username: true },
        })
      : []
    const actorById = new Map(actors.map(actor => [actor.id, actor]))

    res.json({
      logs: logs.map(log => ({
        ...log,
        actor: log.actorUserId ? (actorById.get(log.actorUserId) ?? null) : null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    })
  })
)
