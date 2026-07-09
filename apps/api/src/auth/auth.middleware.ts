import type { NextFunction, Request, Response } from 'express'
import type { ClanRole } from '../generated/prisma/client.js'
import { prisma } from '../utils/prisma.js'
import { HttpError, routeParam } from '../utils/http.js'
import { env } from '../utils/env.js'
import { hashSessionToken } from './session.js'
import { canSetClanRole, roleRank } from './roles.js'

const getTokenFromRequest = (req: Request) => {
  const cookieValue = req.cookies?.[env.cookieName]
  if (typeof cookieValue === 'string' && cookieValue.length > 0) {
    return cookieValue
  }

  const header = req.header('authorization')
  if (header?.startsWith('Bearer ')) {
    return header.slice('Bearer '.length)
  }

  return undefined
}

export const attachAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const token = getTokenFromRequest(req)
  if (!token) {
    return next()
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          memberships: true,
        },
      },
    },
  })

  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
    return next()
  }

  req.auth = { user: session.user, sessionToken: token }
  return next()
}

export const requireUser = (req: Request, _res: Response, next: NextFunction) => {
  if (!req.auth?.user) {
    return next(new HttpError(401, 'Login required.'))
  }
  return next()
}

export const requireAdmin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.auth?.user.globalRole !== 'ADMIN') {
    return next(new HttpError(403, 'Admin role required.'))
  }
  return next()
}

export const getActiveClanRole = (req: Request, clanId: string): ClanRole | 'ADMIN' | null => {
  if (req.auth?.user.globalRole === 'ADMIN') {
    return 'ADMIN'
  }

  const membership = req.auth?.user.memberships.find(item => item.clanId === clanId && item.status === 'ACTIVE')
  return membership?.role ?? null
}

export const hasClanRole = (req: Request, clanId: string, minimumRole: ClanRole) => {
  const role = getActiveClanRole(req, clanId)
  if (role === 'ADMIN') {
    return true
  }
  if (!role) {
    return false
  }
  return roleRank[role] >= roleRank[minimumRole]
}

export const requireClanRole =
  (minimumRole: ClanRole, clanIdParam = 'clanId') =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth?.user) {
      return next(new HttpError(401, 'Login required.'))
    }

    const clanId = routeParam(req, clanIdParam)

    if (!hasClanRole(req, clanId, minimumRole)) {
      return next(new HttpError(403, `${minimumRole} role required for this clan.`))
    }

    return next()
  }

export { canSetClanRole }
