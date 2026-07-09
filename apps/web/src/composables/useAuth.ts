import { computed, ref } from 'vue'
import type { AuthUserDto } from '@bp-tracker/contracts'
import { api, type AuthResponse } from '../services/api'

const user = ref<AuthUserDto | null>(null)
const loaded = ref(false)

export const useAuth = () => {
  const init = async () => {
    if (loaded.value) return
    try {
      const response = await api.get<AuthResponse>('/auth/me')
      user.value = response.user
    } catch {
      user.value = null
    } finally {
      loaded.value = true
    }
  }

  const login = async (username: string, password: string) => {
    const response = await api.post<AuthResponse>('/auth/login', { username, password })
    user.value = response.user
    loaded.value = true
  }

  const logout = async () => {
    await api.post<void>('/auth/logout')
    user.value = null
  }

  const refresh = async () => {
    loaded.value = false
    await init()
  }

  return {
    user,
    loaded,
    isAdmin: computed(() => user.value?.globalRole === 'ADMIN'),
    init,
    login,
    logout,
    refresh,
  }
}

