import crypto from 'node:crypto'
import type { Response } from 'express'
import { prisma } from '../utils/prisma.js'
import { env, isProduction } from '../utils/env.js'

export const hashSessionToken = (token: string) =>
  crypto.createHash('sha256').update(`${env.sessionSecret}:${token}`).digest('hex')

export const createSession = async (userId: string) => {
  const token = crypto.randomBytes(32).toString('base64url')
  const tokenHash = hashSessionToken(token)
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return { token, expiresAt }
}

export const setSessionCookie = (res: Response, token: string, expiresAt: Date) => {
  res.cookie(env.cookieName, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  })
}

export const clearSessionCookie = (res: Response) => {
  res.clearCookie(env.cookieName, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  })
}
