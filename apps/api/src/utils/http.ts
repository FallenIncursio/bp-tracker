import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }

export const routeParam = (req: Request, name: string) => {
  const value = req.params[name]
  if (typeof value !== 'string' || !value) {
    throw new HttpError(400, `Missing route parameter: ${name}.`)
  }
  return value
}

export const notFoundHandler = (_req: Request, _res: Response, next: NextFunction) => {
  next(new HttpError(404, 'Route not found.'))
}

export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed.', details: error.flatten() })
  }

  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message, details: error.details })
  }

  console.error(error)
  return res.status(500).json({ error: 'Internal server error.' })
}
