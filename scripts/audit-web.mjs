import { createRequire } from 'node:module'
import { chromium } from 'playwright'

const require = createRequire(import.meta.url)
const axePath = require.resolve('axe-core/axe.min.js')

const baseUrl = (process.env.BP_TRACKER_AUDIT_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const routes = (process.env.BP_TRACKER_AUDIT_ROUTES ?? '/,/blueprints,/sirius,/checker,/account,/admin,/help,/about')
  .split(',')
  .map(route => route.trim())
  .filter(Boolean)

const budgets = {
  maxLoadMs: Number(process.env.BP_TRACKER_AUDIT_MAX_LOAD_MS ?? 6000),
  maxDomContentLoadedMs: Number(process.env.BP_TRACKER_AUDIT_MAX_DCL_MS ?? 3500),
  maxTransferKb: Number(process.env.BP_TRACKER_AUDIT_MAX_TRANSFER_KB ?? 9000),
  maxDomNodes: Number(process.env.BP_TRACKER_AUDIT_MAX_DOM_NODES ?? 5000),
}

const failures = []

const fail = (route, category, message) => {
  failures.push({ route, category, message })
}

const formatUrl = route => `${baseUrl}${route === '/' ? '' : route}`

const assertReachable = async () => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const response = await fetch(baseUrl, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  } finally {
    clearTimeout(timeout)
  }
}

const auditSeo = (route, seo) => {
  if (!seo.lang || !['de', 'en', 'es'].includes(seo.lang)) {
    fail(route, 'seo', `html lang must be de, en or es, got "${seo.lang || '(empty)'}".`)
  }
  if (!seo.title || seo.title.length < 3 || seo.title.length > 70) {
    fail(route, 'seo', `title length must be 3-70 characters, got ${seo.title?.length ?? 0}.`)
  }
  if (!seo.description || seo.description.length < 50 || seo.description.length > 180) {
    fail(route, 'seo', `meta description length must be 50-180 characters, got ${seo.description?.length ?? 0}.`)
  }
  if (!seo.viewport?.includes('width=device-width')) {
    fail(route, 'seo', 'viewport meta must include width=device-width.')
  }
  if (seo.h1Count !== 1) {
    fail(route, 'seo', `route should expose exactly one h1, got ${seo.h1Count}.`)
  }
}

const auditPerformance = (route, performance) => {
  if (performance.loadMs > budgets.maxLoadMs) {
    fail(route, 'performance', `load ${Math.round(performance.loadMs)}ms exceeds ${budgets.maxLoadMs}ms.`)
  }
  if (performance.domContentLoadedMs > budgets.maxDomContentLoadedMs) {
    fail(
      route,
      'performance',
      `DOMContentLoaded ${Math.round(performance.domContentLoadedMs)}ms exceeds ${budgets.maxDomContentLoadedMs}ms.`
    )
  }
  if (performance.transferKb > budgets.maxTransferKb) {
    fail(route, 'performance', `transfer ${Math.round(performance.transferKb)}KB exceeds ${budgets.maxTransferKb}KB.`)
  }
  if (performance.domNodes > budgets.maxDomNodes) {
    fail(route, 'performance', `DOM node count ${performance.domNodes} exceeds ${budgets.maxDomNodes}.`)
  }
}

const auditFormControls = (route, formControls) => {
  for (const control of formControls.missingIdOrName) {
    fail(
      route,
      'forms',
      `${control.tag} control "${control.label || control.placeholder || control.type || 'unnamed'}" must have an id or name attribute.`
    )
  }
}

const auditAppShell = (route, appShell) => {
  if (appShell.githubLinks < 1) {
    fail(route, 'navigation', 'route should expose a GitHub link.')
  }
  if (appShell.helpLinks < 1) {
    fail(route, 'navigation', 'route should expose a Help link.')
  }
  if (appShell.aboutLinks < 1) {
    fail(route, 'navigation', 'route should expose an About link.')
  }
  if (['/', '/blueprints', '/sirius', '/checker', '/admin'].includes(route) && appShell.tooltipTriggers < 1) {
    fail(route, 'help', 'core route should expose at least one contextual tooltip trigger.')
  }
}

await assertReachable()

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
page.setDefaultTimeout(15000)

try {
  const results = []

  for (const route of routes) {
    const url = formatUrl(route)
    await page.goto(url, { waitUntil: 'networkidle' })
    await page.addScriptTag({ path: axePath })

    const [axe, seo, performance, formControls, appShell] = await Promise.all([
      page.evaluate(async () =>
        window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
        })
      ),
      page.evaluate(() => ({
        title: document.title.trim(),
        lang: document.documentElement.lang,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() ?? '',
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
        h1Count: document.querySelectorAll('h1').length,
      })),
      page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0]
        const resources = performance.getEntriesByType('resource')
        const transferBytes = resources.reduce((sum, resource) => sum + resource.transferSize, 0)
        return {
          loadMs: navigation?.loadEventEnd || performance.now(),
          domContentLoadedMs: navigation?.domContentLoadedEventEnd || performance.now(),
          transferKb: transferBytes / 1024,
          domNodes: document.querySelectorAll('*').length,
        }
      }),
      page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll('input, select, textarea'))
        return {
          total: controls.length,
          missingIdOrName: controls
            .filter(control => !control.id && !control.getAttribute('name'))
            .map(control => {
              const labels = control.labels ? Array.from(control.labels).map(label => label.textContent?.trim()).filter(Boolean) : []
              return {
                tag: control.tagName.toLowerCase(),
                type: control.getAttribute('type'),
                placeholder: control.getAttribute('placeholder'),
                label: labels[0] ?? null,
              }
            }),
        }
      }),
      page.evaluate(() => ({
        githubLinks: document.querySelectorAll('a[href*="github.com"]').length,
        helpLinks: Array.from(document.querySelectorAll('a')).filter(link => link.getAttribute('href') === '/help').length,
        aboutLinks: Array.from(document.querySelectorAll('a')).filter(link => link.getAttribute('href') === '/about').length,
        tooltipTriggers: document.querySelectorAll('.tooltip-trigger').length,
      })),
    ])

    for (const violation of axe.violations) {
      fail(
        route,
        'accessibility',
        `${violation.id}: ${violation.help} (${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'})`
      )
    }

    auditSeo(route, seo)
    auditPerformance(route, performance)
    auditFormControls(route, formControls)
    auditAppShell(route, appShell)
    results.push({ route, accessibilityViolations: axe.violations.length, seo, performance, formControls, appShell })
  }

  if (failures.length > 0) {
    console.error(JSON.stringify({ baseUrl, budgets, failures }, null, 2))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify({ baseUrl, budgets, results }, null, 2))
  }
} finally {
  await browser.close()
}
