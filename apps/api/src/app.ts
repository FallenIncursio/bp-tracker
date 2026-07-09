import express from 'express'
import type { RequestHandler } from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import swaggerUi from 'swagger-ui-express'
import { authRouter } from './auth/auth.routes.js'
import { attachAuth } from './auth/auth.middleware.js'
import { clansRouter } from './clans/clans.routes.js'
import { blueprintsRouter } from './blueprints/blueprints.routes.js'
import { siriusRouter } from './sirius/sirius.routes.js'
import { checkerRouter } from './checker/checker.routes.js'
import { notificationsRouter } from './notifications/notifications.routes.js'
import { usersRouter } from './users/users.routes.js'
import { auditRouter } from './audit/audit.routes.js'
import { openApiSpec } from './openapi/spec.js'
import { env } from './utils/env.js'
import { errorHandler, notFoundHandler } from './utils/http.js'

const docsSecurity: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  )
  next()
}

const swaggerUiOptions = {
  customSiteTitle: 'BP Tracker API Docs',
  swaggerOptions: {
    docExpansion: 'list',
    persistAuthorization: true,
    displayRequestDuration: true,
  },
}

export const createApp = () => {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    cors({
      origin: env.corsOrigin,
      credentials: true,
    })
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(
    '/api/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
    })
  )
  app.use(attachAuth)

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'bp-tracker-api' })
  })
  app.get('/api/openapi.json', docsSecurity, (_req, res) => {
    res.json(openApiSpec)
  })
  app.use('/api/docs', docsSecurity, swaggerUi.serveFiles(openApiSpec, swaggerUiOptions), swaggerUi.setup(openApiSpec, swaggerUiOptions))

  app.use('/api/auth', authRouter)
  app.use('/api/clans', clansRouter)
  app.use('/api/blueprints', blueprintsRouter)
  app.use('/api/sirius', siriusRouter)
  app.use('/api/checker', checkerRouter)
  app.use('/api/notifications', notificationsRouter)
  app.use('/api/users', usersRouter)
  app.use('/api/audit', auditRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
