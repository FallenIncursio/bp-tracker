import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from '../src/services/api'

const jsonResponse = (status: number, body: unknown, ok = status >= 200 && status < 300) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as Response

describe('API service', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends JSON requests with credentials and parses successful responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.post('/items', { name: 'Sirius Sammler' })).resolves.toEqual({ ok: true })

    expect(fetchMock).toHaveBeenCalledWith('/api/items', {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
      body: JSON.stringify({ name: 'Sirius Sammler' }),
    })
  })

  it('supports get, patch, put, delete and undefined request bodies', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { patched: true }))
      .mockResolvedValueOnce(jsonResponse(200, { put: true }))
      .mockResolvedValueOnce(jsonResponse(204, undefined))
      .mockResolvedValueOnce(jsonResponse(200, { posted: true }))
      .mockResolvedValueOnce(jsonResponse(200, { patchNoBody: true }))
      .mockResolvedValueOnce(jsonResponse(200, { putNoBody: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/items')).resolves.toEqual({ items: [] })
    await expect(api.patch('/items/1', { name: 'A' })).resolves.toEqual({ patched: true })
    await expect(api.put('/items/1', { name: 'B' })).resolves.toEqual({ put: true })
    await expect(api.delete('/items/1')).resolves.toBeUndefined()
    await expect(api.post('/items')).resolves.toEqual({ posted: true })
    await expect(api.patch('/items/2')).resolves.toEqual({ patchNoBody: true })
    await expect(api.put('/items/2')).resolves.toEqual({ putNoBody: true })

    expect(fetchMock.mock.calls[4][1]).toMatchObject({ method: 'POST', body: undefined })
    expect(fetchMock.mock.calls[5][1]).toMatchObject({ method: 'PATCH', body: undefined })
    expect(fetchMock.mock.calls[6][1]).toMatchObject({ method: 'PUT', body: undefined })
  })

  it('throws ApiError with server messages and fallback messages', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(403, { error: 'Forbidden', details: { role: 'ADMIN' } }, false))
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('bad json')
        },
      } as Response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(api.get('/admin')).rejects.toMatchObject(new ApiError(403, 'Forbidden', { role: 'ADMIN' }))
    await expect(api.get('/broken')).rejects.toMatchObject(new ApiError(500, 'Request failed.'))
  })
})
