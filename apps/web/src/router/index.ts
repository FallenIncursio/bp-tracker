import { createRouter, createWebHistory } from 'vue-router'
import DashboardPage from '../pages/DashboardPage.vue'
import BlueprintsPage from '../pages/BlueprintsPage.vue'
import SiriusPage from '../pages/SiriusPage.vue'
import CheckerPage from '../pages/CheckerPage.vue'
import OverviewPage from '../pages/OverviewPage.vue'
import AdminPage from '../pages/AdminPage.vue'
import AccountPage from '../pages/AccountPage.vue'
import HelpPage from '../pages/HelpPage.vue'
import AboutPage from '../pages/AboutPage.vue'
import AuthPage from '../pages/AuthPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DashboardPage },
    { path: '/blueprints', component: BlueprintsPage },
    { path: '/sirius', component: SiriusPage },
    { path: '/checker', component: CheckerPage },
    { path: '/overview', component: OverviewPage },
    { path: '/login', component: AuthPage, props: { initialMode: 'login' } },
    { path: '/register', component: AuthPage, props: { initialMode: 'register' } },
    { path: '/admin', component: AdminPage },
    { path: '/account', component: AccountPage },
    { path: '/help', component: HelpPage },
    { path: '/about', component: AboutPage },
  ],
})

export default router
