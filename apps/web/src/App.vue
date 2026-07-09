<script setup lang="ts">
import { computed, markRaw, onMounted, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import {
  CheckSquare,
  Gauge,
  HelpCircle,
  Info,
  Languages,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Orbit,
  ScrollText,
  Shield,
  Sun,
  UserCircle,
  UserPlus,
  Users,
  X,
} from '@lucide/vue'
import { useAuth } from './composables/useAuth'
import { useClans } from './composables/useClans'
import { useTheme } from './composables/useTheme'
import { localeOptions, setLocalePreference, supportedLocales, type SupportedLocale } from './i18n'
import BrandGithubIcon from './components/BrandGithubIcon.vue'
import BrandKofiIcon from './components/BrandKofiIcon.vue'
import ClanSwitcher from './components/ClanSwitcher.vue'

const { user, init, logout, isAdmin } = useAuth()
const { canManageSelectedClan } = useClans()
const { t, locale } = useI18n()
const { isDark, toggleTheme } = useTheme()
const route = useRoute()
const mobileNavOpen = ref(false)
const githubUrl = import.meta.env.VITE_GITHUB_URL ?? 'https://github.com/FallenIncursio/bp-tracker'
const apiDocsUrl = '/api/docs/'
const kofiUrl = 'https://ko-fi.com/fallenincursio'
const appVersion = import.meta.env.VITE_APP_VERSION ?? '0.2.1'
const authRedirectQuery = computed(() => {
  const existingRedirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  const redirectSource = route.path === '/login' || route.path === '/register' ? existingRedirect : route.fullPath
  const redirect = redirectSource.startsWith('/') && !redirectSource.startsWith('//') ? redirectSource : '/'
  return { redirect }
})
const adminNavLabel = computed(() => {
  if (isAdmin.value) return t('nav.admin')
  return canManageSelectedClan.value ? t('nav.clanManagement') : t('nav.clanMembers')
})
const adminNavIcon = computed(() => markRaw(isAdmin.value || canManageSelectedClan.value ? Shield : Users))
const navLinks = computed(() =>
  [
    {
      to: '/',
      label: t('nav.dashboard'),
      icon: markRaw(LayoutDashboard),
      visible: true,
    },
    {
      to: '/blueprints',
      label: t('nav.blueprints'),
      icon: markRaw(ScrollText),
      visible: true,
    },
    {
      to: '/sirius',
      label: t('nav.sirius'),
      icon: markRaw(Orbit),
      visible: true,
    },
    {
      to: '/checker',
      label: t('nav.checker'),
      icon: markRaw(CheckSquare),
      visible: true,
    },
    {
      to: '/account',
      label: t('nav.account'),
      icon: markRaw(UserCircle),
      visible: Boolean(user.value),
    },
    {
      to: '/admin',
      label: adminNavLabel.value,
      icon: adminNavIcon.value,
      visible: Boolean(user.value || isAdmin.value),
    },
    {
      to: '/help',
      label: t('nav.help'),
      icon: markRaw(HelpCircle),
      visible: true,
    },
    { to: '/about', label: t('nav.about'), icon: markRaw(Info), visible: true },
  ].filter((link) => link.visible),
)

const updateLocale = (value: string) => {
  if (supportedLocales.includes(value as SupportedLocale)) {
    setLocalePreference(value as SupportedLocale)
  }
}

const closeMobileNav = () => {
  mobileNavOpen.value = false
}

const toggleMobileNav = () => {
  mobileNavOpen.value = !mobileNavOpen.value
}

onMounted(init)

watch(() => route.fullPath, closeMobileNav)
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar" :class="{ 'mobile-nav-open': mobileNavOpen }">
      <div class="sidebar-header">
        <div class="brand">
          <Gauge :size="24" />
          <span>BP Tracker</span>
        </div>
        <div class="mobile-header-actions">
          <label class="locale-select mobile-locale-select" :title="t('app.language')">
            <Languages :size="16" />
            <select
              id="app-language-mobile"
              name="app-language-mobile"
              :value="locale"
              :aria-label="t('app.language')"
              @change="updateLocale(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in localeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button
            class="icon-button mobile-header-button"
            :title="isDark ? t('app.themeLight') : t('app.themeDark')"
            :aria-label="isDark ? t('app.themeLight') : t('app.themeDark')"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" :size="17" />
            <Moon v-else :size="17" />
          </button>
          <button
            v-if="user"
            class="icon-button mobile-header-button"
            :title="t('app.logout')"
            :aria-label="t('app.logout')"
            @click="logout"
          >
            <LogOut :size="17" />
          </button>
          <button
            class="mobile-nav-toggle"
            type="button"
            :aria-label="mobileNavOpen ? t('app.closeNavigation') : t('app.openNavigation')"
            :aria-expanded="mobileNavOpen"
            aria-controls="mobile-nav-drawer"
            @click="toggleMobileNav"
            @keydown.esc.prevent="closeMobileNav"
          >
            <X v-if="mobileNavOpen" :size="22" />
            <Menu v-else :size="22" />
          </button>
        </div>
      </div>
      <nav class="nav" :aria-label="t('app.navigation')">
        <RouterLink v-for="link in navLinks" :key="link.to" :to="link.to">
          <component :is="link.icon" :size="18" /> {{ link.label }}
        </RouterLink>
      </nav>
      <footer class="sidebar-footer">
        <a :href="githubUrl" target="_blank" rel="noreferrer" :aria-label="t('app.github')">
          <BrandGithubIcon :size="16" /> {{ t('app.github') }}
        </a>
        <a :href="apiDocsUrl" target="_blank" rel="noreferrer" :aria-label="t('app.apiDocs')">
          <ScrollText :size="16" /> {{ t('app.apiDocs') }}
        </a>
        <a :href="kofiUrl" target="_blank" rel="noreferrer" :aria-label="t('app.kofi')">
          <BrandKofiIcon :size="16" /> {{ t('app.kofi') }}
        </a>
        <span>{{ t('app.version', { version: appVersion }) }}</span>
      </footer>
      <button
        v-if="mobileNavOpen"
        class="mobile-nav-overlay"
        type="button"
        :aria-label="t('app.closeNavigation')"
        @click="closeMobileNav"
      ></button>
      <Transition name="mobile-drawer">
        <div v-if="mobileNavOpen" id="mobile-nav-drawer" class="mobile-nav-drawer">
          <div v-if="!user" class="mobile-nav-auth">
            <RouterLink class="topbar-auth-link" :to="{ path: '/login', query: authRedirectQuery }" @click="closeMobileNav">
              <LogIn :size="16" /> {{ t('auth.login') }}
            </RouterLink>
            <RouterLink
              class="topbar-auth-link topbar-auth-primary"
              :to="{ path: '/register', query: authRedirectQuery }"
              @click="closeMobileNav"
            >
              <UserPlus :size="16" /> {{ t('auth.register') }}
            </RouterLink>
          </div>
          <nav class="mobile-nav-links" :aria-label="t('app.navigation')">
            <RouterLink v-for="link in navLinks" :key="`mobile-${link.to}`" :to="link.to" @click="closeMobileNav">
              <component :is="link.icon" :size="18" /> {{ link.label }}
            </RouterLink>
          </nav>
          <div class="mobile-nav-footer">
            <a :href="githubUrl" target="_blank" rel="noreferrer" :aria-label="t('app.github')">
              <BrandGithubIcon :size="16" /> {{ t('app.github') }}
            </a>
            <a :href="apiDocsUrl" target="_blank" rel="noreferrer" :aria-label="t('app.apiDocs')">
              <ScrollText :size="16" /> {{ t('app.apiDocs') }}
            </a>
            <a :href="kofiUrl" target="_blank" rel="noreferrer" :aria-label="t('app.kofi')">
              <BrandKofiIcon :size="16" /> {{ t('app.kofi') }}
            </a>
            <span>{{ t('app.version', { version: appVersion }) }}</span>
          </div>
        </div>
      </Transition>
    </aside>
    <main class="main">
      <header class="topbar">
        <ClanSwitcher />
        <div class="topbar-actions">
          <label class="locale-select" :title="t('app.language')">
            <Languages :size="16" />
            <select
              id="app-language"
              name="app-language"
              :value="locale"
              :aria-label="t('app.language')"
              @change="updateLocale(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in localeOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </label>
          <button
            class="icon-button"
            :title="isDark ? t('app.themeLight') : t('app.themeDark')"
            :aria-label="isDark ? t('app.themeLight') : t('app.themeDark')"
            @click="toggleTheme"
          >
            <Sun v-if="isDark" :size="17" />
            <Moon v-else :size="17" />
          </button>
        </div>
        <div class="user-block">
          <template v-if="user">
            <span>{{ user.displayName }}</span>
          </template>
          <template v-else>
            <RouterLink class="topbar-auth-link" :to="{ path: '/login', query: authRedirectQuery }">
              <LogIn :size="16" /> {{ t('auth.login') }}
            </RouterLink>
            <RouterLink class="topbar-auth-link topbar-auth-primary" :to="{ path: '/register', query: authRedirectQuery }">
              <UserPlus :size="16" /> {{ t('auth.register') }}
            </RouterLink>
          </template>
          <button v-if="user" class="icon-button" :title="t('app.logout')" :aria-label="t('app.logout')" @click="logout">
            <LogOut :size="17" />
          </button>
        </div>
      </header>
      <RouterView />
    </main>
  </div>
</template>
