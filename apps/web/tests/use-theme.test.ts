import { afterEach, describe, expect, it, vi } from 'vitest'

const installBrowserStubs = (storedTheme: string | null, prefersDark = false) => {
  localStorage.clear()
  const store = new Map<string, string>()
  if (storedTheme) {
    store.set('bp-tracker:theme', storedTheme)
    localStorage.setItem('bp-tracker:theme', storedTheme)
  }

  vi.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => store.get(key) ?? null)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key: string, value: string) => {
    store.set(key, value)
  })
  window.matchMedia = vi.fn(() => ({ matches: prefersDark }) as MediaQueryList)
  return store
}

describe('useTheme', () => {
  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('uses a stored theme and persists changes', async () => {
    const store = installBrowserStubs('dark')
    const { useTheme } = await import('../src/composables/useTheme')
    const theme = useTheme()

    expect(theme.theme.value).toBe('dark')
    expect(theme.isDark.value).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    theme.setTheme('light')
    expect(theme.theme.value).toBe('light')
    expect(theme.isDark.value).toBe(false)
    expect(store.get('bp-tracker:theme')).toBe('light')

    theme.toggleTheme()
    expect(theme.theme.value).toBe('dark')
    theme.toggleTheme()
    expect(theme.theme.value).toBe('light')
  })

  it('falls back to system preference when storage is empty or invalid', async () => {
    installBrowserStubs(null, true)
    const darkModule = await import('../src/composables/useTheme')
    expect(darkModule.useTheme().theme.value).toBe('dark')

    vi.resetModules()
    installBrowserStubs('invalid', false)
    const lightModule = await import('../src/composables/useTheme')
    expect(lightModule.useTheme().theme.value).toBe('light')
  })
})
