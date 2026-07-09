import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { asyncHandler, errorHandler, HttpError, notFoundHandler, routeParam } from '../src/utils/http.js'

describe('HTTP helpers', () => {
  it('extracts required route params and rejects missing values', () => {
    expect(routeParam({ params: { clanId: 'clan-1' } } as never, 'clanId')).toBe('clan-1')
    expect(() => routeParam({ params: {} } as never, 'clanId')).toThrow('Missing route parameter: clanId.')
    expect(() => routeParam({ params: { clanId: '' } } as never, 'clanId')).toThrow('Missing route parameter: clanId.')
  })

  it('passes rejected async handlers to next', async () => {
    const error = new Error('boom')
    const next = vi.fn()
    const handler = asyncHandler(async () => {
      throw error
    })

    handler({} as never, {} as never, next)
    await new Promise(resolve => setTimeout(resolve, 0))

    expect(next).toHaveBeenCalledWith(error)
  })

  it('creates a 404 through the not-found handler', () => {
    const next = vi.fn()
    notFoundHandler({} as never, {} as never, next)

    expect(next.mock.calls[0][0]).toMatchObject({ status: 404, message: 'Route not found.' })
  })

  it('serializes zod, http and unknown errors', () => {
    const status = vi.fn(() => response)
    const json = vi.fn(() => response)
    const response = { status, json }

    errorHandler(new z.ZodError([]), {} as never, response as never, vi.fn())
    expect(status).toHaveBeenLastCalledWith(400)
    expect(json).toHaveBeenLastCalledWith(expect.objectContaining({ error: 'Validation failed.' }))

    errorHandler(new HttpError(403, 'Nope.', { reason: 'role' }), {} as never, response as never, vi.fn())
    expect(status).toHaveBeenLastCalledWith(403)
    expect(json).toHaveBeenLastCalledWith({ error: 'Nope.', details: { reason: 'role' } })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    errorHandler(new Error('hidden'), {} as never, response as never, vi.fn())
    expect(status).toHaveBeenLastCalledWith(500)
    expect(json).toHaveBeenLastCalledWith({ error: 'Internal server error.' })
    consoleSpy.mockRestore()
  })
})
