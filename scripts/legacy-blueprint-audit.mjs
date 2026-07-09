import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const legacyStarSystems = {
  0: 'Vega',
  1: 'Antares',
  2: 'Gemini',
  3: 'Mizar',
  4: 'Sol',
  5: 'Draconis',
  6: 'Sirius',
  7: 'Tau Ceti',
  8: 'None',
}

const legacyBlueprintTypes = {
  0: 'Blaster',
  1: 'Collector',
  2: 'Repair Droid',
  3: 'Afterburner',
  4: 'Rockets',
  5: 'Shield',
  6: 'Repair Target',
  7: 'Speed Actuator',
  8: 'Aim Computer',
  9: 'Taunt',
  10: 'Protector',
  11: 'Stun',
  12: 'Perforator',
  13: 'Aim Scrambler',
  14: 'Repair Field',
  15: 'Aggrobeacon',
  16: 'Thermoblast',
  17: 'Aggrobomb',
  18: 'Materializer',
  19: 'Stundome',
  20: 'Sniperblaster',
  21: 'Attack Droid',
  22: 'Orbital Strike',
  23: 'Attack Charge',
  24: 'Repair Turret',
  25: 'Attack Turret',
  26: 'Sticky Bomb',
  27: 'Mine Layer',
  28: 'Color Pattern',
  29: 'Spaceship',
  30: 'Drone',
  31: 'Cortex',
  32: 'Damage Inverter',
  33: 'Lightning Chain',
  34: 'Corruption Cloud',
  35: 'Formation Aura',
  36: 'Magnet Array',
  37: 'Target Teleportation',
  38: 'Range Leech',
  39: 'Deflection Robot',
}

const generatedSiriusResourceTiers = [
  { name: 'Oolyte', ring: 1 },
  { name: 'Dolomyte', ring: 2 },
  { name: 'Clay', ring: 3 },
  { name: 'Kenyte', ring: 4 },
]

const generatedSiriusResourceItems = [
  'Blaster',
  'Sammler',
  'Reparaturdroide',
  'Nachbrenner',
  'Raketen',
  'Zielcomputer',
  'Perforator',
  'Thermoblast',
  'Schild',
  'Taunt',
  'Zielscrambler',
  'Aggrobombe',
  'Speed',
  'Stun',
  'Aggrobeacon',
  'Stundome',
  'Zielreparatur',
  'Schutz',
  'Reparaturfeld',
  'Dosenoeffner',
  'Sniperblaster',
  'Angriffsdroide',
  'Orbitalschlag',
  'Angriffsladung',
  'Reparaturfeldturm',
  'Angriffsfeldturm',
  'Haftbombe',
  'Mine',
]

const firstValue = (args, names) => {
  for (const name of names) {
    const index = args.indexOf(name)
    if (index !== -1 && args[index + 1]) {
      return args[index + 1]
    }
    const prefix = `${name}=`
    const inline = args.find(arg => arg.startsWith(prefix))
    if (inline) {
      return inline.slice(prefix.length)
    }
  }
  return null
}

const printUsageAndExit = () => {
  console.error(`
Usage:
  npm run legacy:audit -- <path-to-blueprint.json>
  npm run legacy:audit -- <path-to-blueprint.json> --out work/legacy-blueprint-audit

The script is read-only. It compares a legacy NRNF bot blueprint.json dump against
the neutral BP Tracker seed catalog and writes JSON + Markdown reports.
`)
  process.exit(1)
}

const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'))

const toBoolean = value => value === true || value === 1 || value === '1'

const parseInteger = value => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

const parseDate = value => {
  if (!value) return null
  const iso = String(value).replace(' ', 'T')
  const parsed = new Date(`${iso.endsWith('Z') ? iso : `${iso}Z`}`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const compact = value => (typeof value === 'string' && value.trim() ? value.trim() : null)

const germanFold = value =>
  value
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss')

const normalizeName = value =>
  germanFold(String(value ?? ''))
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const knownSystems = ['Vega', 'Antares', 'Gemini', 'Mizar', 'Sol', 'Draconis', 'Sirius']

const legacyNameVariants = name => {
  const variants = new Set([name])
  variants.add(String(name).replace(/-/g, ' '))
  for (const system of knownSystems) {
    const ancientPattern = new RegExp(`^${system}\\s+Ancient\\s+`, 'i')
    if (ancientPattern.test(name)) {
      variants.add(String(name).replace(ancientPattern, `${system} `))
    }
  }
  return Array.from(variants).filter(Boolean)
}

const addToCounter = (counter, key, amount = 1) => {
  const normalizedKey = key ?? '(empty)'
  counter[normalizedKey] = (counter[normalizedKey] ?? 0) + amount
}

const topEntries = (counter, limit = 20) =>
  Object.entries(counter)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))

const summarizeRow = row => ({
  legacyId: row.id,
  name: row.name,
  normalizedName: normalizeName(row.name),
  system: legacyStarSystems[row.starSystem] ?? `Unknown (${row.starSystem})`,
  type: legacyBlueprintTypes[row.type] ?? `Unknown (${row.type})`,
  amount: parseInteger(row.amount),
  source: compact(row.source),
  enemy: compact(row.enemy),
  lastDropDateTime: compact(row.lastDropDateTime),
  listOnSystemList: toBoolean(row.listOnSystemList),
  hidden: toBoolean(row.hidden),
})

const buildCurrentCatalog = seedFile => {
  const seedRows = readJson(seedFile)
  const generatedResources = generatedSiriusResourceTiers.flatMap(tier =>
    generatedSiriusResourceItems.map(item => ({
      canonicalName: `${tier.name} ${item}`,
      system: 'Sirius',
      itemType: item,
      variant: null,
      siriusRing: tier.ring,
      slotGroup: 'RESOURCE',
      rarity: 'STANDARD',
      sourceNotes: 'Generated by apps/api/prisma/seed.ts from Sirius resource tiers.',
      generated: true,
    }))
  )

  return [...seedRows, ...generatedResources].map(row => ({
    ...row,
    generated: Boolean(row.generated),
    normalizedNames: Array.from(
      new Set(
        [row.canonicalName, row.nameDe, row.nameEn]
          .filter(Boolean)
          .flatMap(name => [normalizeName(name), ...legacyNameVariants(String(name)).map(normalizeName)])
      )
    ),
  }))
}

const buildCatalogIndexes = catalog => {
  const exact = new Map()
  const normalized = new Map()
  for (const row of catalog) {
    exact.set(row.canonicalName, row)
    for (const normalizedName of row.normalizedNames) {
      const rows = normalized.get(normalizedName) ?? []
      rows.push(row)
      normalized.set(normalizedName, rows)
    }
  }
  return { exact, normalized }
}

const matchLegacyRow = (legacyRow, indexes) => {
  const exactMatch = indexes.exact.get(legacyRow.name)
  if (exactMatch) {
    return { kind: 'exact', blueprint: exactMatch, matchedBy: legacyRow.name }
  }

  for (const variant of legacyNameVariants(legacyRow.name)) {
    const candidates = indexes.normalized.get(normalizeName(variant)) ?? []
    if (candidates.length === 1) {
      return { kind: variant === legacyRow.name ? 'normalized' : 'variant', blueprint: candidates[0], matchedBy: variant }
    }
    if (candidates.length > 1) {
      return {
        kind: 'ambiguous',
        candidates: candidates.map(candidate => candidate.canonicalName),
        matchedBy: variant,
      }
    }
  }

  return { kind: 'missing' }
}

const classifyExpansionBucket = row => {
  const system = legacyStarSystems[row.starSystem]
  const type = legacyBlueprintTypes[row.type]
  const source = compact(row.source) ?? ''

  if (toBoolean(row.hidden)) return 'hidden'
  if (system === 'Sirius') return 'sirius-review'
  if (system === 'Tau Ceti') return 'tau-ceti'
  if (type === 'Spaceship') return 'ships'
  if (type === 'Color Pattern') return 'cosmetics'
  if (system === 'None') return 'special-or-event'
  if (/event|spaceball/i.test(source)) return 'event'
  return 'classic-systems'
}

const groupRowsForPreview = rows => {
  const bySystem = {}
  const byType = {}
  const bySource = {}
  for (const row of rows) {
    addToCounter(bySystem, row.system)
    addToCounter(byType, row.type)
    addToCounter(bySource, row.source)
  }
  return {
    count: rows.length,
    bySystem: topEntries(bySystem, 12),
    byType: topEntries(byType, 12),
    bySource: topEntries(bySource, 12),
    examples: rows.slice(0, 25),
  }
}

const buildMarkdown = report => {
  const lines = []
  lines.push('# Legacy Blueprint Audit')
  lines.push('')
  lines.push(`Generated: ${report.meta.generatedAt}`)
  lines.push(`Legacy file: \`${report.meta.legacyPath}\``)
  lines.push('')
  lines.push('## Summary')
  lines.push('')
  lines.push(`- Legacy rows: ${report.summary.legacyRows}`)
  lines.push(`- Visible rows: ${report.summary.visibleRows}`)
  lines.push(`- Hidden rows: ${report.summary.hiddenRows}`)
  lines.push(`- Current neutral catalog rows: ${report.summary.currentCatalogRows}`)
  lines.push(`- Exact matches: ${report.summary.matches.exact}`)
  lines.push(`- Normalized/variant matches: ${report.summary.matches.normalized + report.summary.matches.variant}`)
  lines.push(`- Ambiguous matches: ${report.summary.matches.ambiguous}`)
  lines.push(`- Missing from current catalog: ${report.summary.matches.missing}`)
  lines.push(`- Rows with legacy last-drop timestamps: ${report.summary.legacyDropHistory.withTimestamps}`)
  lines.push('')
  lines.push('## Expansion Buckets')
  lines.push('')
  for (const [bucket, value] of Object.entries(report.expansionBuckets)) {
    lines.push(`- ${bucket}: ${value.count}`)
  }
  lines.push('')
  lines.push('## Top Missing Systems')
  lines.push('')
  for (const entry of report.missingSummary.bySystem) {
    lines.push(`- ${entry.name}: ${entry.count}`)
  }
  lines.push('')
  lines.push('## Top Missing Types')
  lines.push('')
  for (const entry of report.missingSummary.byType) {
    lines.push(`- ${entry.name}: ${entry.count}`)
  }
  lines.push('')
  lines.push('## Notes')
  lines.push('')
  lines.push('- This report is read-only and intentionally does not write to the database.')
  lines.push('- Legacy `lastDropDateTime` values are global historical hints, not clan-specific Sirius evidence.')
  lines.push('- Use the JSON report for row-level review before adding neutral seed data.')
  return `${lines.join('\n')}\n`
}

const args = process.argv.slice(2)
const legacyArg = firstValue(args, ['--legacy', '-l']) ?? args.find(arg => !arg.startsWith('-')) ?? process.env.BP_TRACKER_LEGACY_BLUEPRINT_JSON
if (!legacyArg) {
  printUsageAndExit()
}

const legacyPath = path.resolve(process.cwd(), legacyArg)
const seedPath = path.join(rootDir, 'data/seeds/blueprints.json')
const outDir = path.resolve(process.cwd(), firstValue(args, ['--out', '-o']) ?? 'work/legacy-blueprint-audit')

if (!existsSync(legacyPath)) {
  console.error(`Legacy blueprint file not found: ${legacyPath}`)
  printUsageAndExit()
}

const legacyRows = readJson(legacyPath)
if (!Array.isArray(legacyRows)) {
  throw new Error('Legacy blueprint file must contain a JSON array.')
}

const catalog = buildCurrentCatalog(seedPath)
const indexes = buildCatalogIndexes(catalog)

const counters = {
  systems: {},
  types: {},
  sources: {},
  missingSystems: {},
  missingTypes: {},
  missingSources: {},
  dropHistoryYears: {},
  dropHistorySystems: {},
}

const matches = {
  exact: [],
  normalized: [],
  variant: [],
  ambiguous: [],
  missing: [],
}

const duplicateNames = {}
const invalidAmounts = []
const unknownSystems = []
const unknownTypes = []
let hiddenRows = 0
let visibleRows = 0
let withTimestamps = 0
let earliestDrop = null
let latestDrop = null

for (const row of legacyRows) {
  const summarized = summarizeRow(row)
  const hidden = summarized.hidden
  if (hidden) hiddenRows += 1
  else visibleRows += 1

  addToCounter(duplicateNames, summarized.name)
  addToCounter(counters.systems, summarized.system)
  addToCounter(counters.types, summarized.type)
  addToCounter(counters.sources, summarized.source)

  if (!legacyStarSystems[row.starSystem]) {
    unknownSystems.push(summarized)
  }
  if (!legacyBlueprintTypes[row.type]) {
    unknownTypes.push(summarized)
  }
  if (summarized.amount !== null && summarized.amount < 0) {
    invalidAmounts.push(summarized)
  }

  const dropDate = parseDate(row.lastDropDateTime)
  if (dropDate) {
    withTimestamps += 1
    earliestDrop = !earliestDrop || dropDate < earliestDrop ? dropDate : earliestDrop
    latestDrop = !latestDrop || dropDate > latestDrop ? dropDate : latestDrop
    addToCounter(counters.dropHistoryYears, String(dropDate.getUTCFullYear()))
    addToCounter(counters.dropHistorySystems, summarized.system)
  }

  const match = matchLegacyRow(row, indexes)
  const matchedSummary =
    match.kind === 'missing'
      ? summarized
      : {
          ...summarized,
          matchedBy: match.matchedBy,
          currentCanonicalName: match.blueprint?.canonicalName ?? null,
          currentSystem: match.blueprint?.system ?? null,
          currentItemType: match.blueprint?.itemType ?? null,
          currentRarity: match.blueprint?.rarity ?? null,
          currentSlotGroup: match.blueprint?.slotGroup ?? null,
          candidates: match.candidates,
        }

  matches[match.kind].push(matchedSummary)
  if (match.kind === 'missing') {
    addToCounter(counters.missingSystems, summarized.system)
    addToCounter(counters.missingTypes, summarized.type)
    addToCounter(counters.missingSources, summarized.source)
  }
}

const expansionBucketRows = {}
for (const row of matches.missing) {
  const bucket = classifyExpansionBucket({
    starSystem: Object.entries(legacyStarSystems).find(([, value]) => value === row.system)?.[0],
    type: Object.entries(legacyBlueprintTypes).find(([, value]) => value === row.type)?.[0],
    source: row.source,
    hidden: row.hidden ? '1' : '0',
  })
  expansionBucketRows[bucket] ??= []
  expansionBucketRows[bucket].push(row)
}

const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    legacyPath,
    seedPath,
    note: 'Read-only comparison against neutral BP Tracker seeds. Does not import private clan data.',
  },
  summary: {
    legacyRows: legacyRows.length,
    visibleRows,
    hiddenRows,
    currentCatalogRows: catalog.length,
    currentCatalogGeneratedSiriusResources: generatedSiriusResourceTiers.length * generatedSiriusResourceItems.length,
    matches: {
      exact: matches.exact.length,
      normalized: matches.normalized.length,
      variant: matches.variant.length,
      ambiguous: matches.ambiguous.length,
      missing: matches.missing.length,
    },
    legacyDropHistory: {
      withTimestamps,
      earliest: earliestDrop?.toISOString() ?? null,
      latest: latestDrop?.toISOString() ?? null,
      byYear: topEntries(counters.dropHistoryYears, 20),
      bySystem: topEntries(counters.dropHistorySystems, 12),
    },
  },
  currentCatalogSummary: {
    baseSeedRows: catalog.length - generatedSiriusResourceTiers.length * generatedSiriusResourceItems.length,
    generatedSiriusResources: generatedSiriusResourceTiers.length * generatedSiriusResourceItems.length,
    bySystem: topEntries(
      catalog.reduce((counter, row) => {
        addToCounter(counter, row.system ?? 'None')
        return counter
      }, {}),
      12
    ),
    byRarity: topEntries(
      catalog.reduce((counter, row) => {
        addToCounter(counter, row.rarity)
        return counter
      }, {}),
      12
    ),
  },
  legacySummary: {
    bySystem: topEntries(counters.systems, 12),
    byType: topEntries(counters.types, 50),
    bySource: topEntries(counters.sources, 50),
  },
  missingSummary: {
    bySystem: topEntries(counters.missingSystems, 12),
    byType: topEntries(counters.missingTypes, 50),
    bySource: topEntries(counters.missingSources, 50),
  },
  expansionBuckets: Object.fromEntries(Object.entries(expansionBucketRows).map(([bucket, rows]) => [bucket, groupRowsForPreview(rows)])),
  normalizedMatches: {
    count: matches.normalized.length + matches.variant.length,
    examples: [...matches.normalized, ...matches.variant].slice(0, 100),
  },
  ambiguousMatches: matches.ambiguous,
  missingRows: matches.missing,
  dataQuality: {
    duplicateNames: topEntries(
      Object.fromEntries(Object.entries(duplicateNames).filter(([, count]) => count > 1)),
      50
    ),
    invalidAmounts,
    unknownSystems,
    unknownTypes,
  },
  recommendedNextSteps: [
    'Review expansionBuckets.tau-ceti, expansionBuckets.classic-systems, expansionBuckets.ships and expansionBuckets.special-or-event separately.',
    'Do not import legacy lastDropDateTime values into SiriusDropEvent unless a dedicated global/public history model is added.',
    'Treat rows in expansionBuckets.sirius-review as validation input only, because the current Sirius catalog is based on the newer Prelude reference.',
    'Keep private clan member and ownership data out of public seed files.',
  ],
}

mkdirSync(outDir, { recursive: true })
const jsonPath = path.join(outDir, 'legacy-blueprint-audit.json')
const markdownPath = path.join(outDir, 'legacy-blueprint-audit.md')

writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
writeFileSync(markdownPath, buildMarkdown(report), 'utf8')

console.log(`Legacy blueprint audit written:
- ${jsonPath}
- ${markdownPath}`)
console.log(
  `Summary: ${report.summary.matches.exact} exact, ${
    report.summary.matches.normalized + report.summary.matches.variant
  } normalized/variant, ${report.summary.matches.ambiguous} ambiguous, ${report.summary.matches.missing} missing.`
)
