import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import { chromium, type Browser, type Page } from 'playwright'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../apps/api/src/generated/prisma/client.ts'

type StepStatus = 'passed' | 'failed' | 'skipped'

type StepResult = {
  name: string
  status: StepStatus
  durationMs: number
  error?: string
  screenshot?: string
}

type ApiResponse<T = unknown> = {
  status: number
  body: T
  text: string
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
dotenv.config({ path: path.join(repoRoot, '.env') })

const webBaseUrl = process.env.E2E_WEB_BASE_URL ?? process.env.PUBLIC_BASE_URL ?? 'http://localhost:5173'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3000'
const rawDatabaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL
const databaseUrl = rawDatabaseUrl?.replace('@postgres:5432', '@localhost:5433')
const password = process.env.E2E_PASSWORD ?? 'E2ePassword!2026'
const runId = process.env.E2E_RUN_ID ?? `e2e-${Date.now().toString(36)}`
const prefix = runId.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 38)
const outputDir = path.join(repoRoot, 'output', 'e2e', prefix)

if (!databaseUrl) {
  throw new Error('E2E_DATABASE_URL, DIRECT_DATABASE_URL or DATABASE_URL is required.')
}

fs.mkdirSync(outputDir, { recursive: true })

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

const results: StepResult[] = []
const findings: string[] = []

const log = (message: string) => {
  console.log(`[e2e] ${message}`)
}

const slug = (value: string) => `${prefix}-${value}`
const userName = (value: string) => `${prefix}-${value}`
const displayName = (value: string) => `E2E ${prefix} ${value}`
const now = () => new Date()
const isoHoursFromNow = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) {
    throw new Error(message)
  }
}

function expectDefined<T>(value: T | null | undefined, message: string): T {
  assert(value !== null && value !== undefined, message)
  return value
}

const sanitizeFileName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80)

const screenshot = async (page: Page | null | undefined, name: string) => {
  if (!page) return undefined
  const filePath = path.join(outputDir, `${sanitizeFileName(name)}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath
}

const step = async (name: string, fn: () => Promise<void>, page?: Page | null) => {
  const started = Date.now()
  try {
    await fn()
    results.push({ name, status: 'passed', durationMs: Date.now() - started })
    log(`PASS ${name}`)
  } catch (error) {
    const shot = await screenshot(page, `failed-${name}`).catch(() => undefined)
    const message = error instanceof Error ? error.stack || error.message : String(error)
    results.push({ name, status: 'failed', durationMs: Date.now() - started, error: message, screenshot: shot })
    findings.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    log(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

class ApiClient {
  private cookie = ''

  constructor(private readonly label: string) {}

  async request<T = unknown>(
    method: string,
    route: string,
    body?: unknown,
    expectedStatus?: number | number[]
  ): Promise<ApiResponse<T>> {
    const response = await fetch(`${apiBaseUrl}/api${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    })

    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      this.cookie = setCookie.split(';')[0]
    }

    const text = await response.text()
    const parsedBody = text ? safeJson(text) : null
    const expected = Array.isArray(expectedStatus) ? expectedStatus : expectedStatus === undefined ? undefined : [expectedStatus]
    if (expected && !expected.includes(response.status)) {
      throw new Error(
        `${this.label} ${method} ${route} returned ${response.status}, expected ${expected.join('/')}: ${text.slice(0, 500)}`
      )
    }
    return { status: response.status, body: parsedBody as T, text }
  }

  async login(username: string) {
    await this.request('POST', '/auth/login', { username, password }, 200)
  }
}

const safeJson = (text: string) => {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const cleanup = async () => {
  const users = await prisma.user.findMany({ where: { username: { startsWith: `${prefix}-` } }, select: { id: true } })
  const clans = await prisma.clan.findMany({ where: { slug: { startsWith: `${prefix}-` } }, select: { id: true } })
  const planets = await prisma.siriusPlanet.findMany({ where: { name: { startsWith: `E2E ${prefix}` } }, select: { id: true } })
  const userIds = users.map(user => user.id)
  const clanIds = clans.map(clan => clan.id)

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds.length ? userIds : ['__none__'] } },
        { clanId: { in: clanIds.length ? clanIds : ['__none__'] } },
        { summary: { contains: prefix } },
      ],
    },
  })
  await prisma.clan.deleteMany({ where: { id: { in: clanIds.length ? clanIds : ['__none__'] } } })
  await prisma.user.deleteMany({ where: { id: { in: userIds.length ? userIds : ['__none__'] } } })
  await prisma.siriusPlanet.deleteMany({ where: { id: { in: planets.map(planet => planet.id).length ? planets.map(planet => planet.id) : ['__none__'] } } })
}

const seedUser = async ({
  key,
  globalRole = 'USER',
  memberships = [],
}: {
  key: string
  globalRole?: 'USER' | 'ADMIN'
  memberships?: Array<{ clanId: string; role: 'MEMBER' | 'COMMANDER' | 'ADMIRAL'; status?: 'ACTIVE' | 'PENDING' | 'REJECTED' }>
}) => {
  const passwordHash = await bcrypt.hash(password, 10)
  return prisma.user.create({
    data: {
      username: userName(key),
      displayName: displayName(key),
      email: `${userName(key)}@example.invalid`,
      passwordHash,
      globalRole,
      notificationPrefs: { create: {} },
      memberships: {
        create: memberships.map(membership => ({
          clanId: membership.clanId,
          role: membership.role,
          status: membership.status ?? 'ACTIVE',
          approvedAt: membership.status === 'PENDING' ? null : now(),
        })),
      },
    },
  })
}

const setupData = async () => {
  await cleanup()

  const [blueprints, rule18, rule2, ship, siriusSystem] = await Promise.all([
    prisma.blueprint.findMany({ orderBy: [{ nameDe: 'asc' }], take: 5 }),
    prisma.siriusBlueprintDropRule.findFirst({
      where: { ring: 5, slotGroup: 'SLOT_18' },
      include: { blueprint: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.siriusBlueprintDropRule.findFirst({
      where: { ring: 5, slotGroup: 'SLOT_2' },
      include: { blueprint: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.ship.findFirst({ include: { requirements: true }, orderBy: { name: 'asc' } }),
    prisma.gameSystem.findFirst({ where: { name: 'Sirius' } }),
  ])

  assert(blueprints.length >= 3, 'Seed data must contain at least 3 blueprints.')
  const requiredRule18 = expectDefined(rule18, 'Seed data must contain a Sirius ring-5 SLOT_18 drop rule.')
  const requiredRule2 = expectDefined(rule2, 'Seed data must contain a Sirius ring-5 SLOT_2 drop rule.')
  const requiredShip = expectDefined(ship, 'Seed data must contain at least one ship.')
  const requiredSiriusSystem = expectDefined(siriusSystem, 'Seed data must contain Sirius game system.')

  const clanA = await prisma.clan.create({ data: { name: `E2E ${prefix} Clan A`, slug: slug('clan-a'), isPublic: true } })
  const clanB = await prisma.clan.create({ data: { name: `E2E ${prefix} Clan B`, slug: slug('clan-b'), isPublic: true } })

  const admin = await seedUser({ key: 'admin', globalRole: 'ADMIN' })
  const admiral = await seedUser({ key: 'admiral-a', memberships: [{ clanId: clanA.id, role: 'ADMIRAL' }] })
  const commander = await seedUser({ key: 'commander-a', memberships: [{ clanId: clanA.id, role: 'COMMANDER' }] })
  const member = await seedUser({ key: 'member-a', memberships: [{ clanId: clanA.id, role: 'MEMBER' }] })
  const excluded = await seedUser({ key: 'excluded-a', memberships: [{ clanId: clanA.id, role: 'MEMBER' }] })
  const outsider = await seedUser({ key: 'outsider-b', memberships: [{ clanId: clanB.id, role: 'ADMIRAL' }] })
  const pendingReject = await seedUser({ key: 'pending-reject-a', memberships: [{ clanId: clanA.id, role: 'MEMBER', status: 'PENDING' }] })

  return {
    clanA,
    clanB,
    users: { admin, admiral, commander, member, excluded, outsider, pendingReject },
    master: {
      blueprints,
      rule18: requiredRule18,
      rule2: requiredRule2,
      ship: requiredShip,
      siriusSystem: requiredSiriusSystem,
    },
  }
}

const loginUi = async (browser: Browser, username: string, clanId?: string) => {
  const context = await browser.newContext({ viewport: { width: 1365, height: 850 } })
  if (clanId) {
    await context.addInitScript(([selectedClanId]) => {
      window.localStorage.setItem('bp-tracker:selected-clan', selectedClanId)
    }, [clanId])
  }
  const page = await context.newPage()
  page.on('console', message => {
    if (message.type() === 'error') {
      findings.push(`Browser console error (${username}): ${message.text()}`)
    }
  })
  await page.goto(`${webBaseUrl}/login`, { waitUntil: 'networkidle' })
  await page.locator('#auth-username').fill(username)
  await page.locator('#auth-password').fill(password)
  await page.locator('form .primary-button').click()
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 })
  await page.waitForLoadState('networkidle')
  return { context, page }
}

const expectNoPageHorizontalOverflow = async (page: Page, label: string) => {
  const metrics = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }))
  assert(
    metrics.documentWidth <= metrics.viewport + 1 && metrics.bodyWidth <= metrics.viewport + 1,
    `${label} has horizontal page overflow: ${JSON.stringify(metrics)}`
  )
}

const run = async () => {
  log(`Run id: ${prefix}`)
  log(`Web: ${webBaseUrl}`)
  log(`API: ${apiBaseUrl}`)
  log(`Output: ${outputDir}`)

  const data = await setupData()
  const clients = {
    guest: new ApiClient('guest'),
    admin: new ApiClient('admin'),
    admiral: new ApiClient('admiral'),
    commander: new ApiClient('commander'),
    member: new ApiClient('member'),
    excluded: new ApiClient('excluded'),
    outsider: new ApiClient('outsider'),
  }

  const browser = await chromium.launch({ headless: true })
  try {
    await step('health: web and api respond', async () => {
      const [web, setupState, openapi] = await Promise.all([
        fetch(webBaseUrl),
        fetch(`${apiBaseUrl}/api/auth/setup-state`),
        fetch(`${apiBaseUrl}/api/openapi.json`),
      ])
      assert(web.ok, `Web returned ${web.status}`)
      assert(setupState.ok, `Setup state returned ${setupState.status}`)
      assert(openapi.ok, `OpenAPI returned ${openapi.status}`)
    })

    await step('auth: API logins for all seeded roles', async () => {
      await clients.admin.login(data.users.admin.username)
      await clients.admiral.login(data.users.admiral.username)
      await clients.commander.login(data.users.commander.username)
      await clients.member.login(data.users.member.username)
      await clients.excluded.login(data.users.excluded.username)
      await clients.outsider.login(data.users.outsider.username)
    })

    await step('auth: UI login works for admin', async () => {
      const { context, page } = await loginUi(browser, data.users.admin.username, data.clanA.id)
      try {
        await page.goto(`${webBaseUrl}/admin`, { waitUntil: 'networkidle' })
        await page.locator('h1.page-title').filter({ hasText: /Admin/ }).waitFor({ timeout: 10000 })
        await expectNoPageHorizontalOverflow(page, 'Admin desktop')
      } finally {
        await context.close()
      }
    })

    await step('auth: wrong password is rejected', async () => {
      await clients.guest.request('POST', '/auth/login', { username: data.users.member.username, password: 'wrong-password' }, 401)
    })

    await step('auth: UI registration creates pending clan membership', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 850 } })
      const page = await context.newPage()
      try {
        await page.goto(`${webBaseUrl}/register`, { waitUntil: 'networkidle' })
        await page.locator('#auth-username').fill(userName('registered-a'))
        await page.locator('#auth-password').fill(password)
        await page.locator('#auth-display-name').fill(displayName('registered-a'))
        await page.locator('#auth-email').fill(`${userName('registered-a')}@example.invalid`)
        await page.locator('#auth-clan-id').selectOption(data.clanA.id)
        await page.locator('form .primary-button').click()
        await page.waitForURL(url => !url.pathname.includes('/register'), { timeout: 10000 })
        const registered = await prisma.user.findUnique({
          where: { username: userName('registered-a') },
          include: { memberships: true },
        })
        assert(registered, 'Registered user was not created.')
        assert(registered.memberships[0]?.status === 'PENDING', 'Registered user should start as PENDING.')
      } finally {
        await context.close()
      }
    })

    await step('permissions: guests and outsiders cannot access protected clan routes', async () => {
      await clients.guest.request('GET', `/sirius/clans/${data.clanA.id}/journey`, undefined, 401)
      await clients.outsider.request('GET', `/clans/${data.clanA.id}/registrations`, undefined, 403)
      await clients.member.request('GET', `/clans/${data.clanA.id}/registrations`, undefined, 403)
      await clients.commander.request('GET', `/clans/${data.clanA.id}/registrations`, undefined, 200)
    })

    await step('permissions: commander approve cannot escalate to admiral', async () => {
      const registered = await prisma.user.findUnique({ where: { username: userName('registered-a') } })
      assert(registered, 'Registered pending user not found.')
      const response = await clients.commander.request<{ membership: { role: string; status: string } }>(
        'POST',
        `/clans/${data.clanA.id}/registrations/${registered.id}/approve`,
        { role: 'ADMIRAL' },
        200
      )
      assert(response.body.membership.status === 'ACTIVE', 'Approved membership should become ACTIVE.')
      assert(response.body.membership.role === 'MEMBER', `Commander escalated pending user to ${response.body.membership.role}.`)
    })

    await step('permissions: admiral cannot assign admiral, admin can', async () => {
      await clients.admiral.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.member.id}/role`,
        { role: 'ADMIRAL' },
        403
      )
      await clients.commander.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.member.id}/role`,
        { role: 'MEMBER' },
        403
      )
      await clients.admin.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.member.id}/role`,
        { role: 'ADMIRAL' },
        200
      )
      await clients.admin.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.member.id}/role`,
        { role: 'MEMBER' },
        200
      )
    })

    await step('admin: tracking exclusion affects checker default scope', async () => {
      await clients.commander.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.excluded.id}/tracking`,
        { trackingExcluded: true, reason: `${prefix} inactive` },
        200
      )
      await clients.member.request(
        'PATCH',
        `/clans/${data.clanA.id}/members/${data.users.excluded.id}/tracking`,
        { trackingExcluded: false },
        403
      )
      const noExcluded = await clients.member.request<{ rows: Array<{ userId: string }> }>(
        'GET',
        `/checker/ships/${data.master.ship.id}/check?clanId=${data.clanA.id}`,
        undefined,
        200
      )
      const withExcluded = await clients.member.request<{ rows: Array<{ userId: string }> }>(
        'GET',
        `/checker/ships/${data.master.ship.id}/check?clanId=${data.clanA.id}&includeExcluded=true`,
        undefined,
        200
      )
      assert(!noExcluded.body.rows.some(row => row.userId === data.users.excluded.id), 'Excluded member appears in default checker results.')
      assert(withExcluded.body.rows.some(row => row.userId === data.users.excluded.id), 'Excluded member missing when includeExcluded=true.')
    })

    await step('blueprints: personal single and bulk statuses work; UNKNOWN is rejected', async () => {
      const first = data.master.blueprints[0]!
      const second = data.master.blueprints[1]!
      await clients.member.request('PUT', `/blueprints/me/statuses/${first.id}`, { status: 'WANTED' }, 200)
      await clients.member.request('PUT', '/blueprints/me/statuses', { blueprintIds: [first.id, second.id], status: 'OWNED' }, 200)
      await clients.member.request('PUT', `/blueprints/me/statuses/${first.id}`, { status: 'UNKNOWN' }, 400)
      const statuses = await clients.member.request<{ statuses: Array<{ blueprintId: string; status: string }> }>(
        'GET',
        '/blueprints/me/statuses',
        undefined,
        200
      )
      const owned = statuses.body.statuses.filter(status => [first.id, second.id].includes(status.blueprintId))
      assert(owned.length === 2 && owned.every(status => status.status === 'OWNED'), 'Bulk status update did not persist as OWNED.')
    })

    await step('blueprints: UI multi-select is visible only after selection and has no unknown option', async () => {
      const { context, page } = await loginUi(browser, data.users.member.username, data.clanA.id)
      try {
        await page.goto(`${webBaseUrl}/blueprints`, { waitUntil: 'networkidle' })
        await page.waitForSelector('.responsive-desktop-table tbody tr')
        assert((await page.locator('.bulk-actionbar').count()) === 0, 'Bulk actionbar should not be visible before selecting rows.')
        const statusOptions = await page.locator('select[name^="blueprintStatus"] option').evaluateAll(options =>
          options.map(option => (option as HTMLOptionElement).value)
        )
        assert(!statusOptions.includes('UNKNOWN'), 'Blueprint status select exposes UNKNOWN option.')
        await page.locator('.responsive-desktop-table tbody .checkbox-button').nth(0).click()
        await page.locator('.responsive-desktop-table tbody .checkbox-button').nth(1).click()
        await page.waitForSelector('.bulk-actionbar')
        assert((await page.locator('.responsive-desktop-table tbody tr.selected-row').count()) === 2, 'Two selected rows should be highlighted.')
      } finally {
        await context.close()
      }
    })

    let appearanceId = ''
    let slotId = ''
    let journeyStopA = ''
    let journeyStopB = ''

    await step('sirius: commander creates ring-5 appearance; member cannot edit it', async () => {
      const response = await clients.commander.request<{ appearance: { id: string; nextSpawnAt: string | null; ring: number } }>(
        'POST',
        `/sirius/clans/${data.clanA.id}/appearances`,
        {
          planetName: `E2E ${prefix} R5`,
          ring: 5,
          observedAt: isoHoursFromNow(-1),
          expiresAt: isoHoursFromNow(24),
          notes: `${prefix} ring 5`,
        },
        201
      )
      appearanceId = response.body.appearance.id
      assert(response.body.appearance.ring === 5, 'Created appearance should be ring 5.')
      assert(response.body.appearance.nextSpawnAt, 'Ring-5 appearance should receive nextSpawnAt.')
      await clients.member.request(
        'PUT',
        `/sirius/appearances/${appearanceId}/slots`,
        { slots: [{ slotGroup: 'SLOT_18', blueprintId: data.master.rule18.blueprintId }] },
        403
      )
    })

    await step('sirius: ring-4 appearance has no next spawn', async () => {
      const response = await clients.commander.request<{ appearance: { nextSpawnAt: string | null; ring: number } }>(
        'POST',
        `/sirius/clans/${data.clanA.id}/appearances`,
        {
          planetName: `E2E ${prefix} R4`,
          ring: 4,
          observedAt: isoHoursFromNow(-1),
          expiresAt: isoHoursFromNow(30),
          notes: `${prefix} ring 4`,
        },
        201
      )
      assert(response.body.appearance.ring === 4, 'Created appearance should be ring 4.')
      assert(response.body.appearance.nextSpawnAt === null, 'Ring 1-4 appearance should not receive nextSpawnAt.')
    })

    await step('sirius: slot rules reject invalid slot/blueprint combinations', async () => {
      await clients.commander.request(
        'PUT',
        `/sirius/appearances/${appearanceId}/slots`,
        {
          slots: [
            { slotGroup: 'SLOT_18', blueprintId: data.master.rule18.blueprintId },
            {
              slotGroup: 'SLOT_2',
              enemyType: data.master.rule2.enemyType ?? 'SORIS',
              blueprintId: data.master.rule2.blueprintId,
            },
          ],
        },
        200
      )
      const slots = await prisma.siriusPlanetBlueprintSlot.findMany({ where: { appearanceId }, orderBy: { createdAt: 'asc' } })
      assert(slots.length === 2, `Expected 2 slots after replace, got ${slots.length}.`)
      slotId = slots[0]!.id
      await clients.commander.request(
        'PUT',
        `/sirius/appearances/${appearanceId}/slots`,
        { slots: [{ slotGroup: 'SLOT_18', blueprintId: data.master.rule2.blueprintId }] },
        400
      )
    })

    await step('sirius: commander can update and delete slot', async () => {
      await clients.commander.request(
        'PATCH',
        `/sirius/slots/${slotId}`,
        { slotGroup: 'SLOT_18', blueprintId: data.master.rule18.blueprintId },
        200
      )
      await clients.commander.request('DELETE', `/sirius/slots/${slotId}`, undefined, 204)
      const deleted = await prisma.siriusPlanetBlueprintSlot.findUnique({ where: { id: slotId } })
      assert(!deleted, 'Deleted Sirius slot still exists.')
    })

    await step('journey: roadmap is hidden from guests and editable by commander', async () => {
      await clients.guest.request('GET', `/sirius/clans/${data.clanA.id}/journey`, undefined, 401)
      await clients.member.request('GET', `/sirius/clans/${data.clanA.id}/journey`, undefined, 200)
      await clients.member.request(
        'POST',
        `/sirius/clans/${data.clanA.id}/journey`,
        { planetName: `E2E ${prefix} denied`, ring: 5, status: 'PLANNED' },
        403
      )
      const a = await clients.commander.request<{ stop: { id: string } }>(
        'POST',
        `/sirius/clans/${data.clanA.id}/journey`,
        {
          appearanceId,
          arriveAt: isoHoursFromNow(2),
          departAt: isoHoursFromNow(5),
          status: 'CURRENT',
          certainty: 'CONFIRMED',
          notes: `${prefix} current`,
        },
        201
      )
      const b = await clients.commander.request<{ stop: { id: string } }>(
        'POST',
        `/sirius/clans/${data.clanA.id}/journey`,
        {
          planetName: `E2E ${prefix} free stop`,
          ring: 5,
          arriveAt: isoHoursFromNow(6),
          departAt: isoHoursFromNow(8),
          status: 'PLANNED',
          certainty: 'TENTATIVE',
          notes: `${prefix} planned`,
        },
        201
      )
      journeyStopA = a.body.stop.id
      journeyStopB = b.body.stop.id
      await clients.commander.request('PUT', `/sirius/clans/${data.clanA.id}/journey/reorder`, { stopIds: [journeyStopB, journeyStopA] }, 200)
      await clients.commander.request('PATCH', `/sirius/journey/${journeyStopB}`, { notes: `${prefix} edited`, status: 'PLANNED' }, 200)
      await clients.commander.request('DELETE', `/sirius/journey/${journeyStopA}`, undefined, 204)
    })

    await step('checker: systems and Sirius scopes return coherent data', async () => {
      const systems = await clients.member.request<{ systems: Array<{ id: string; name: string; blueprintCount: number; siriusCounts?: Record<string, number> }> }>(
        'GET',
        '/checker/systems',
        undefined,
        200
      )
      const sirius = systems.body.systems.find(system => system.name === 'Sirius')
      assert(sirius?.siriusCounts, 'Checker systems response should expose Sirius counts.')
      assert((sirius.siriusCounts.allRingFive ?? 0) >= (sirius.siriusCounts.ownRingFive ?? 0), 'All Sirius ring-5 count should be >= own count.')
      const own = await clients.member.request<{ blueprints: unknown[]; rows: unknown[] }>(
        'GET',
        `/checker/systems/${sirius.id}/check?clanId=${data.clanA.id}&siriusScope=own`,
        undefined,
        200
      )
      const all = await clients.member.request<{ blueprints: unknown[]; rows: unknown[] }>(
        'GET',
        `/checker/systems/${sirius.id}/check?clanId=${data.clanA.id}&siriusScope=all-ring5`,
        undefined,
        200
      )
      assert(all.body.blueprints.length >= own.body.blueprints.length, 'All Sirius scope should include at least as many blueprints as own scope.')
    })

    await step('account: profile and notification preferences can be edited', async () => {
      await clients.member.request('PATCH', '/users/me', { displayName: displayName('member-a-updated') }, 200)
      const prefs = await clients.member.request<{ preferences: { discordEnabled: boolean; wantedBpAlerts: boolean } }>(
        'PATCH',
        '/notifications/preferences',
        { discordEnabled: true, wantedBpAlerts: false },
        200
      )
      assert(prefs.body.preferences.discordEnabled === true, 'discordEnabled preference not saved.')
      assert(prefs.body.preferences.wantedBpAlerts === false, 'wantedBpAlerts preference not saved.')
    })

    await step('discord settings: admiral can save clan settings, commander cannot', async () => {
      await clients.commander.request(
        'PATCH',
        `/clans/${data.clanA.id}/discord-settings`,
        { enabled: false, statusEnabled: false, statusPinMessages: true },
        403
      )
      const response = await clients.admiral.request<{ settings: { enabled: boolean; statusEnabled: boolean; statusPinMessages: boolean } }>(
        'PATCH',
        `/clans/${data.clanA.id}/discord-settings`,
        {
          enabled: false,
          statusEnabled: false,
          statusPinMessages: false,
          guildId: '',
          notificationChannelId: '',
          notificationChannelName: '',
          statusChannelId: '',
          statusChannelName: '',
        },
        200
      )
      assert(response.body.settings.statusPinMessages === false, 'Discord pin setting was not saved.')
    })

    await step('admin: audit records important actions', async () => {
      const audit = await clients.admin.request<{ logs: Array<{ action: string }> }>('GET', '/audit?limit=100', undefined, 200)
      const actions = new Set(audit.body.logs.map(log => log.action))
      for (const action of ['clan.membership.approve', 'clan.membership.role', 'sirius.appearance.create', 'sirius.journey.create']) {
        assert(actions.has(action), `Audit log is missing ${action}.`)
      }
      await clients.commander.request('GET', '/audit', undefined, 403)
    })

    await step('ui: guest dashboard does not show roadmap details', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true })
      const page = await context.newPage()
      try {
        await page.goto(webBaseUrl, { waitUntil: 'networkidle' })
        await expectNoPageHorizontalOverflow(page, 'Guest mobile dashboard')
        assert((await page.locator('text=Clan-Route').count()) === 0, 'Guest dashboard shows Clan-Route roadmap section.')
      } finally {
        await context.close()
      }
    })

    await step('ui: admin mobile has no horizontal page overflow', async () => {
      const context = await browser.newContext({ viewport: { width: 390, height: 900 }, isMobile: true })
      await context.addInitScript(([selectedClanId]) => {
        window.localStorage.setItem('bp-tracker:selected-clan', selectedClanId)
      }, [data.clanA.id])
      const page = await context.newPage()
      try {
        await page.goto(`${webBaseUrl}/login`, { waitUntil: 'networkidle' })
        await page.locator('#auth-username').fill(data.users.admin.username)
        await page.locator('#auth-password').fill(password)
        await page.locator('form .primary-button').click()
        await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 10000 })
        await page.goto(`${webBaseUrl}/admin`, { waitUntil: 'networkidle' })
        await expectNoPageHorizontalOverflow(page, 'Admin mobile')
      } finally {
        await context.close()
      }
    })
  } finally {
    await browser.close()
    await cleanup()
  }
}

const writeReport = async () => {
  const report = {
    runId: prefix,
    webBaseUrl,
    apiBaseUrl,
    outputDir,
    totals: {
      passed: results.filter(result => result.status === 'passed').length,
      failed: results.filter(result => result.status === 'failed').length,
      skipped: results.filter(result => result.status === 'skipped').length,
    },
    findings,
    results,
  }
  const jsonPath = path.join(outputDir, 'report.json')
  const mdPath = path.join(outputDir, 'report.md')
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2))
  fs.writeFileSync(
    mdPath,
    [
      `# BP Tracker E2E Report`,
      ``,
      `Run: \`${prefix}\``,
      `Web: ${webBaseUrl}`,
      `API: ${apiBaseUrl}`,
      ``,
      `## Totals`,
      ``,
      `- Passed: ${report.totals.passed}`,
      `- Failed: ${report.totals.failed}`,
      `- Skipped: ${report.totals.skipped}`,
      ``,
      `## Findings`,
      ``,
      ...(findings.length ? findings.map(finding => `- ${finding}`) : ['- None']),
      ``,
      `## Steps`,
      ``,
      ...results.map(result => `- ${result.status.toUpperCase()} ${result.name} (${result.durationMs}ms)${result.screenshot ? ` - ${result.screenshot}` : ''}`),
      ``,
    ].join('\n')
  )
  log(`Report written: ${mdPath}`)
  log(`JSON written: ${jsonPath}`)
}

const main = async () => {
  try {
    await run()
  } catch (error) {
    findings.push(`Fatal: ${error instanceof Error ? error.message : String(error)}`)
    results.push({
      name: 'fatal',
      status: 'failed',
      durationMs: 0,
      error: error instanceof Error ? error.stack || error.message : String(error),
    })
  } finally {
    await writeReport()
    await prisma.$disconnect()
  }

  const failed = results.filter(result => result.status === 'failed')
  if (failed.length > 0) {
    process.exitCode = 1
  }
}

void main()
