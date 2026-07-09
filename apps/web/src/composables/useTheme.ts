import { computed, ref } from 'vue'

export type ThemeName = 'light' | 'dark'

const storageKey = 'bp-tracker:theme'

const getInitialTheme = (): ThemeName => {
  const stored = localStorage.getItem(storageKey)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<ThemeName>(getInitialTheme())

const applyTheme = (value: ThemeName) => {
  document.documentElement.dataset.theme = value
  document.documentElement.style.colorScheme = value
  localStorage.setItem(storageKey, value)
}

applyTheme(theme.value)

export const useTheme = () => {
  const setTheme = (value: ThemeName) => {
    theme.value = value
    applyTheme(value)
  }

  const toggleTheme = () => {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return {
    theme,
    isDark: computed(() => theme.value === 'dark'),
    setTheme,
    toggleTheme,
  }
}
