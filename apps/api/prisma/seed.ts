import 'dotenv/config'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { PrismaClient, type BlueprintRarity, type BlueprintSlotGroup } from '../src/generated/prisma/client.js'
import type { SiriusTechTier } from '../src/generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { partsRequiredBySlotGroup, siriusResourceItems, siriusResourceParts } from '../src/sirius/sirius-parts.js'

type BlueprintSeed = {
  canonicalName: string
  nameDe?: string
  nameEn?: string | null
  system: string | null
  itemType: string | null
  variant: string | null
  siriusRing?: number | null
  siriusTechTier?: SiriusTechTier | null
  slotGroup: BlueprintSlotGroup
  partsRequired?: number | null
  rarity: BlueprintRarity
  sourceNotes: string
}

type SiriusPlanetSeed = {
  name: string
  ring: number | null
  sortOrder: number
}

type ShipSeed = {
  name: string
  system: string | null
  className: string | null
  requirements: string[]
}

type LocalizedSeedName = {
  de: string
  en: string
  es?: string | null
}

type TranslationEntry = {
  locale: 'de' | 'en' | 'es'
  name: string | null | undefined
  source: string
  verified: boolean
}

const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL

if (!databaseUrl) {
  throw new Error('DATABASE_URL or DIRECT_DATABASE_URL is required for seeding.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
})

const findRootDir = () => {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]

  for (const start of starts) {
    let current = start
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, 'package.json')
      if (existsSync(candidate)) {
        try {
          const packageJson = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string }
          if (packageJson.name === 'bp-tracker') return current
        } catch {
          // Keep walking; a malformed adjacent package.json should not prevent seeding.
        }
      }
      current = path.dirname(current)
    }
  }

  throw new Error('Could not locate bp-tracker repository root for seed data.')
}

const rootDir = findRootDir()

const readJson = <T>(relativePath: string): T => {
  const fullPath = path.join(rootDir, relativePath)
  return JSON.parse(readFileSync(fullPath, 'utf8')) as T
}

const baseSystems = [
  { code: 'vega', name: 'Vega', sortOrder: 10 },
  { code: 'antares', name: 'Antares', sortOrder: 20 },
  { code: 'gemini', name: 'Gemini', sortOrder: 30 },
  { code: 'mizar', name: 'Mizar', sortOrder: 40 },
  { code: 'sol', name: 'Sol', sortOrder: 50 },
  { code: 'draconis', name: 'Draconis', sortOrder: 60 },
  { code: 'sirius', name: 'Sirius', sortOrder: 70 },
  { code: 'tau-ceti', name: 'Tau Ceti', sortOrder: 80 },
  { code: 'oort', name: 'Oort', sortOrder: 90 },
]

const siriusRingFiveDropSystems = new Set(['Vega', 'Antares', 'Gemini', 'Mizar', 'Sol', 'Draconis', 'Sirius'])
const siriusRingFiveDropSlotGroups: BlueprintSlotGroup[] = ['SLOT_18', 'SLOT_14', 'SLOT_12', 'SLOT_5', 'SLOT_2']
const siriusDropRuleSources = [
  'Public Sirius resource tier seed',
  'Public Sirius blueprint slot seed',
  'Public Sirius cross-system R5 seed',
] as const

const siriusResourceTiers: Array<{ ring: number; techTier: SiriusTechTier; label: string }> = [
  { ring: 1, techTier: 'OOLYTE', label: 'Oolyte' },
  { ring: 2, techTier: 'DOLOMYTE', label: 'Dolomyte' },
  { ring: 3, techTier: 'CLAY', label: 'Clay' },
  { ring: 4, techTier: 'KENYTE', label: 'Kenyte' },
]

const blueprintTermNames: Record<string, LocalizedSeedName> = {
  '6070-ER': { de: '6070-ER', en: '6070-ER', es: '6070-ER' },
  Aggrobeacon: { de: 'Aggrobeacon', en: 'Aggro Beacon', es: 'Señuelo' },
  Aggrobombe: { de: 'Aggrobombe', en: 'Aggro Bomb', es: 'Bomba de Aggro' },
  Angriffsbuff: { de: 'Angriffsbuff', en: 'Attack Buff', es: 'Potenciador de Ataque' },
  Angriffsdroide: { de: 'Angriffsdroide', en: 'Attack Droid', es: 'Androide de Ataque' },
  Angriffsfeldturm: { de: 'Angriffsfeldturm', en: 'Attack Field Turret', es: 'Torreta de Campo de Ataque' },
  Angriffsladung: { de: 'Angriffsladung', en: 'Attack Charge', es: 'Carga de Ataque' },
  Angriffsturm: { de: 'Angriffsturm', en: 'Attack Turret', es: 'Torreta de Ataque' },
  Ancient: { de: 'Ancient', en: 'Ancient', es: 'Antiguo' },
  Beschleuniger: { de: 'Beschleuniger', en: 'Accelerator', es: 'Acelerador' },
  Blaster: { de: 'Blaster', en: 'Blaster', es: 'Cañón' },
  Bruderschaft: { de: 'Bruderschaft', en: 'Brotherhood', es: 'Hermandad' },
  Chaos: { de: 'Chaos', en: 'Chaos', es: 'Caos' },
  Dosenoeffner: { de: 'Dosenöffner', en: 'Can Opener', es: 'Abrelatas' },
  Ghost: { de: 'Ghost', en: 'Ghost' },
  Haftbombe: { de: 'Haftbombe', en: 'Sticky Bomb', es: 'Bomba Adhesiva' },
  Legionary: { de: 'Legionary', en: 'Legionary' },
  Materialisierer: { de: 'Materialisierer', en: 'Materializer', es: 'Resucitador' },
  Mine: { de: 'Mine', en: 'Mine', es: 'Mina' },
  Minenleger: { de: 'Minenleger', en: 'Mine Layer', es: 'Minador' },
  Myst: { de: 'Myst', en: 'Myst' },
  Nachbrenner: { de: 'Nachbrenner', en: 'Afterburner', es: 'Impulsor' },
  Orbitalschlag: { de: 'Orbitalschlag', en: 'Orbital Strike', es: 'Ataque Orbital' },
  'Organische Streifen': { de: 'Organische Streifen', en: 'Organic Stripes', es: 'Rayas Orgánicas' },
  Perforator: { de: 'Perforator', en: 'Perforator', es: 'Perforador' },
  Protektor: { de: 'Protektor', en: 'Protector', es: 'Protector' },
  Punisher: { de: 'Punisher', en: 'Punisher' },
  Raider: { de: 'Raider', en: 'Raider' },
  Raketen: { de: 'Raketen', en: 'Rockets', es: 'Proyectiles' },
  Raven: { de: 'Raven', en: 'Raven' },
  Reparaturdroide: { de: 'Reparaturdroide', en: 'Repair Droid', es: 'Androide de Reparación' },
  Reparaturfeld: { de: 'Reparaturfeld', en: 'Repair Field', es: 'Campo de Reparación' },
  Reparaturfeldturm: { de: 'Reparaturfeldturm', en: 'Repair Field Turret', es: 'Torreta de Campo de Reparación' },
  Reparaturturm: { de: 'Reparaturturm', en: 'Repair Turret', es: 'Torreta de Reparación' },
  Sammler: { de: 'Sammler', en: 'Collector', es: 'Recolector' },
  Scharfschuetzenblaster: { de: 'Scharfschützenblaster', en: 'Sniper Blaster', es: 'Cañón de Francotirador' },
  Schild: { de: 'Schild', en: 'Shield', es: 'Escudo' },
  Schutz: { de: 'Schutz', en: 'Protector', es: 'Protector' },
  Sniperblaster: { de: 'Sniperblaster', en: 'Sniper Blaster', es: 'Cañón de Francotirador' },
  Speed: { de: 'Speed', en: 'Speed', es: 'Velocidad' },
  Stun: { de: 'Stun', en: 'Stun' },
  Stunladung: { de: 'Stunladung', en: 'Stun Charge', es: 'Carga aturdidora' },
  Stundome: { de: 'Stundome', en: 'Stun Dome', es: 'Cúpula Aturdidora' },
  Taunt: { de: 'Taunt', en: 'Taunt', es: 'Provocación' },
  Thermoblast: { de: 'Thermoblast', en: 'Thermoblast' },
  Thermoblaster: { de: 'Thermoblaster', en: 'Thermoblaster' },
  Wiederbelebung: { de: 'Wiederbelebung', en: 'Resurrection', es: 'Resucitadores' },
  Zielcomputer: { de: 'Zielcomputer', en: 'Aim Computer', es: 'Mira Computarizada' },
  Zielreparatur: { de: 'Zielreparatur', en: 'Target Repair', es: 'Telerreparador' },
  Zielscrambler: { de: 'Zielscrambler', en: 'Aim Scrambler', es: 'Interferidor de Mira' },
}

const legacyBlueprintAliases = new Map<string, string[]>([
  ['6070-ER', ['6070.0']],
  ['Ancient', ['Antik']],
])

const legacyBlueprintTermRenames = [
  { from: 'Speed', to: 'Beschleuniger' },
  {
    from: 'Stun',
    to: 'Stunladung',
    reverseModifiers: [
      { from: 'lange', to: 'langer' },
      { from: 'starke', to: 'starker' },
    ],
  },
] as const

const replaceExactTerm = (value: string, from: string, to: string) =>
  value
    .split(' ')
    .map((part) => (part === from ? to : part))
    .join(' ')

const legacyAliasesForBlueprint = (canonicalName: string) => {
  const aliases = new Set(legacyBlueprintAliases.get(canonicalName) ?? [])

  for (const rename of legacyBlueprintTermRenames) {
    if (!canonicalName.split(' ').includes(rename.to)) continue

    let alias = replaceExactTerm(canonicalName, rename.to, rename.from)
    for (const modifier of 'reverseModifiers' in rename ? rename.reverseModifiers : []) {
      alias = alias.replace(new RegExp(`\\b${modifier.from} ${rename.from}\\b`, 'g'), `${modifier.to} ${rename.from}`)
    }
    aliases.add(alias)
  }

  return Array.from(aliases)
}

const translatedBlueprintTerms = Object.keys(blueprintTermNames).sort((a, b) => b.length - a.length)

const blueprintModifierNames: Record<string, Omit<LocalizedSeedName, 'de'>> = {
  lange: { en: 'Long', es: 'Largo' },
  langer: { en: 'Long', es: 'Largo' },
  langes: { en: 'Long', es: 'Largo' },
  schnelle: { en: 'Fast', es: 'Rápido' },
  schneller: { en: 'Fast', es: 'Rápido' },
  starke: { en: 'Strong', es: 'Fuerte' },
  starker: { en: 'Strong', es: 'Fuerte' },
  starkes: { en: 'Strong', es: 'Fuerte' },
}

const localizePrefix = (prefix: string) => {
  const parts = prefix.split(' ')
  const modifier = parts.at(-1)
  if (!modifier || !blueprintModifierNames[modifier]) {
    return { de: prefix, en: prefix, es: prefix }
  }

  const translatedModifier = blueprintModifierNames[modifier]
  return {
    de: prefix,
    en: [...parts.slice(0, -1), translatedModifier.en].join(' '),
    es: translatedModifier.es ? [...parts.slice(0, -1), translatedModifier.es].join(' ') : null,
  }
}

const localizeSpanishBlueprintName = (prefix: string, term: string) => {
  const parts = prefix.split(' ')
  const modifier = parts.at(-1)
  const translatedModifier = modifier ? blueprintModifierNames[modifier]?.es : null
  if (!translatedModifier) {
    return `${prefix} ${term}`
  }

  return [...parts.slice(0, -1), term, translatedModifier].join(' ')
}

const localizeNameByTerm = (canonicalName: string) => {
  for (const term of translatedBlueprintTerms) {
    const translated = blueprintTermNames[term]
    if (canonicalName === term) {
      return translated
    }
    if (canonicalName.endsWith(` ${term}`)) {
      const prefix = canonicalName.slice(0, -term.length).trim()
      const localizedPrefix = localizePrefix(prefix)
      return {
        de: `${localizedPrefix.de} ${translated.de}`,
        en: `${localizedPrefix.en} ${translated.en}`,
        es: translated.es ? localizeSpanishBlueprintName(prefix, translated.es) : null,
      }
    }
  }

  return { de: canonicalName, en: canonicalName, es: null }
}

const blueprintDisplayNames = (blueprint: BlueprintSeed) => {
  const fallback = localizeNameByTerm(blueprint.canonicalName)
  return {
    nameDe: blueprint.nameDe?.trim() || fallback.de,
    nameEn: blueprint.nameEn === null ? null : blueprint.nameEn?.trim() || fallback.en,
    nameEs: fallback.es,
  }
}

const itemTypeDisplayNames = (name: string) => {
  const translated = blueprintTermNames[name]
  return {
    nameDe: translated?.de ?? name,
    nameEn: translated?.en ?? name,
    nameEs: translated?.es ?? null,
  }
}

const seedTranslationEntries = (names: { nameDe: string; nameEn?: string | null; nameEs?: string | null }): TranslationEntry[] => [
  { locale: 'de', name: names.nameDe, source: 'public-seed', verified: true },
  { locale: 'en', name: names.nameEn, source: 'public-seed', verified: true },
  { locale: 'es', name: names.nameEs, source: 'prelude-myzen/dictionary + seed-rule', verified: false },
]

const upsertBlueprintTranslations = async (
  blueprintId: string,
  names: { nameDe: string; nameEn?: string | null; nameEs?: string | null },
) => {
  for (const translation of seedTranslationEntries(names)) {
    const name = translation.name?.trim()
    if (!name) continue

    await prisma.blueprintTranslation.upsert({
      where: { blueprintId_locale: { blueprintId, locale: translation.locale } },
      update: { name, source: translation.source, verified: translation.verified },
      create: {
        blueprintId,
        locale: translation.locale,
        name,
        source: translation.source,
        verified: translation.verified,
      },
    })
  }
}

const upsertItemTypeTranslations = async (
  itemTypeId: string,
  names: { nameDe: string; nameEn?: string | null; nameEs?: string | null },
) => {
  for (const translation of seedTranslationEntries(names)) {
    const name = translation.name?.trim()
    if (!name) continue

    await prisma.blueprintItemTypeTranslation.upsert({
      where: { itemTypeId_locale: { itemTypeId, locale: translation.locale } },
      update: { name, source: translation.source, verified: translation.verified },
      create: {
        itemTypeId,
        locale: translation.locale,
        name,
        source: translation.source,
        verified: translation.verified,
      },
    })
  }
}

const legacyEnemyLocations = [
  { label: 'Soris', enemyType: 'SORIS' },
  { label: 'Amarna', enemyType: 'AMARNA' },
  { label: 'Giza', enemyType: 'GIZA' },
] as const

const buildSiriusResourceBlueprints = (): BlueprintSeed[] =>
  siriusResourceTiers.flatMap((tier, tierIndex) =>
    siriusResourceItems.map((item) => ({
      canonicalName: `${tier.label} ${item.name}`,
      system: 'Sirius',
      itemType: item.itemType,
      variant: null,
      siriusRing: tier.ring,
      siriusTechTier: tier.techTier,
      slotGroup: 'RESOURCE',
      partsRequired: siriusResourceParts(item.name, tierIndex),
      rarity: 'STANDARD',
      sourceNotes: `Public Sirius resource tier seed; ring ${tier.ring} ${tier.label}.`,
    })),
  )

const normalizeCode = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const itemTypeRenames = [
  { from: '6070.0', to: '6070-ER' },
  { from: 'Antik', to: 'Ancient' },
  { from: 'Speed', to: 'Beschleuniger' },
  { from: 'Stun', to: 'Stunladung' },
] as const

const main = async () => {
  const blueprints = [...readJson<BlueprintSeed[]>('data/seeds/blueprints.json'), ...buildSiriusResourceBlueprints()]
  const planets = readJson<SiriusPlanetSeed[]>('data/seeds/sirius-planets.json')
  const ships = readJson<ShipSeed[]>('data/seeds/ships.json')
  const blueprintCanonicalRenames = blueprints.flatMap((bp) =>
    legacyAliasesForBlueprint(bp.canonicalName).map((alias) => ({ from: alias, to: bp.canonicalName })),
  )

  for (const rename of blueprintCanonicalRenames) {
    const [legacy, target] = await Promise.all([
      prisma.blueprint.findUnique({ where: { canonicalName: rename.from }, select: { id: true } }),
      prisma.blueprint.findUnique({ where: { canonicalName: rename.to }, select: { id: true } }),
    ])
    if (legacy && !target) {
      await prisma.blueprint.update({
        where: { id: legacy.id },
        data: { canonicalName: rename.to },
      })
    }
  }

  const systemNames = new Map<string, string>()
  for (const system of baseSystems) {
    const created = await prisma.gameSystem.upsert({
      where: { code: system.code },
      update: { name: system.name, sortOrder: system.sortOrder },
      create: system,
    })
    systemNames.set(created.name, created.id)
  }

  const itemTypeNames = Array.from(new Set(blueprints.map((bp) => bp.itemType).filter((value): value is string => Boolean(value)))).sort(
    (a, b) => a.localeCompare(b, 'de'),
  )

  const itemTypeIds = new Map<string, string>()
  for (const rename of itemTypeRenames) {
    const [legacy, target] = await Promise.all([
      prisma.blueprintItemType.findUnique({ where: { code: normalizeCode(rename.from) }, select: { id: true } }),
      prisma.blueprintItemType.findUnique({ where: { code: normalizeCode(rename.to) }, select: { id: true } }),
    ])
    if (legacy && !target) {
      await prisma.blueprintItemType.update({
        where: { id: legacy.id },
        data: {
          code: normalizeCode(rename.to),
          nameDe: rename.to,
          nameEn: rename.to,
        },
      })
    }
  }

  for (const [index, name] of itemTypeNames.entries()) {
    const itemTypeDisplay = itemTypeDisplayNames(name)
    const created = await prisma.blueprintItemType.upsert({
      where: { code: normalizeCode(name) },
      update: { nameDe: itemTypeDisplay.nameDe, nameEn: itemTypeDisplay.nameEn, sortOrder: index + 1 },
      create: {
        code: normalizeCode(name),
        nameDe: itemTypeDisplay.nameDe,
        nameEn: itemTypeDisplay.nameEn,
        sortOrder: index + 1,
      },
    })
    await upsertItemTypeTranslations(created.id, itemTypeDisplay)
    itemTypeIds.set(name, created.id)
  }

  for (const bp of blueprints) {
    const isSiriusBlueprint = bp.system === 'Sirius'
    const siriusRing = bp.siriusRing ?? (isSiriusBlueprint ? 5 : null)
    const siriusTechTier = bp.siriusTechTier ?? (isSiriusBlueprint ? 'ANCIENT' : null)
    const partsRequired = bp.partsRequired ?? (bp.rarity === 'COSMETIC' ? null : (partsRequiredBySlotGroup[bp.slotGroup] ?? null))
    const names = blueprintDisplayNames(bp)
    const createdBlueprint = await prisma.blueprint.upsert({
      where: { canonicalName: bp.canonicalName },
      update: {
        nameDe: names.nameDe,
        nameEn: names.nameEn,
        systemId: bp.system ? systemNames.get(bp.system) : null,
        itemTypeId: bp.itemType ? itemTypeIds.get(bp.itemType) : null,
        variant: bp.variant,
        siriusRing,
        siriusTechTier,
        slotGroup: bp.slotGroup,
        partsRequired,
        rarity: bp.rarity,
        sourceNotes: bp.sourceNotes,
      },
      create: {
        canonicalName: bp.canonicalName,
        nameDe: names.nameDe,
        nameEn: names.nameEn,
        systemId: bp.system ? systemNames.get(bp.system) : null,
        itemTypeId: bp.itemType ? itemTypeIds.get(bp.itemType) : null,
        variant: bp.variant,
        siriusRing,
        siriusTechTier,
        slotGroup: bp.slotGroup,
        partsRequired,
        rarity: bp.rarity,
        sourceNotes: bp.sourceNotes,
      },
    })
    await upsertBlueprintTranslations(createdBlueprint.id, names)
    for (const alias of legacyAliasesForBlueprint(bp.canonicalName)) {
      await prisma.blueprintAlias.upsert({
        where: { blueprintId_alias: { blueprintId: createdBlueprint.id, alias } },
        update: { language: null, source: 'legacy-name' },
        create: { blueprintId: createdBlueprint.id, alias, language: null, source: 'legacy-name' },
      })
    }
  }

  const seededBlueprints = await prisma.blueprint.findMany({
    where: {
      canonicalName: { in: blueprints.map((bp) => bp.canonicalName) },
      rarity: { not: 'COSMETIC' },
      OR: [
        { siriusRing: { not: null } },
        {
          system: { name: { in: Array.from(siriusRingFiveDropSystems) } },
          slotGroup: { in: siriusRingFiveDropSlotGroups },
        },
      ],
    },
    include: { system: true },
  })

  await prisma.userBlueprintStatus.deleteMany({
    where: {
      blueprint: { rarity: 'COSMETIC' },
    },
  })

  await prisma.siriusBlueprintDropRule.deleteMany({
    where: {
      source: { in: [...siriusDropRuleSources] },
    },
  })

  for (const blueprint of seededBlueprints) {
    if (!blueprint.slotGroup) continue
    const inferredRing =
      blueprint.siriusRing ??
      (blueprint.system &&
      siriusRingFiveDropSystems.has(blueprint.system.name) &&
      siriusRingFiveDropSlotGroups.includes(blueprint.slotGroup)
        ? 5
        : null)
    if (!inferredRing) continue

    const techTier = blueprint.siriusTechTier ?? (inferredRing === 5 ? 'ANCIENT' : null)
    const source =
      blueprint.slotGroup === 'RESOURCE'
        ? 'Public Sirius resource tier seed'
        : blueprint.system?.name === 'Sirius'
          ? 'Public Sirius blueprint slot seed'
          : 'Public Sirius cross-system R5 seed'
    const ruleKey = [`r${inferredRing}`, techTier ?? 'any', blueprint.slotGroup, 'any', blueprint.id].join(':')

    await prisma.siriusBlueprintDropRule.upsert({
      where: { ruleKey },
      update: {
        blueprintId: blueprint.id,
        ring: inferredRing,
        techTier,
        slotGroup: blueprint.slotGroup,
        enemyType: null,
        source,
      },
      create: {
        ruleKey,
        blueprintId: blueprint.id,
        ring: inferredRing,
        techTier,
        slotGroup: blueprint.slotGroup,
        enemyType: null,
        source,
      },
    })
  }

  for (const legacyLocation of legacyEnemyLocations) {
    await prisma.siriusPlanetBlueprintSlot.updateMany({
      where: { locationName: { equals: legacyLocation.label, mode: 'insensitive' } },
      data: {
        slotGroup: 'SLOT_2',
        enemyType: legacyLocation.enemyType,
        locationName: null,
      },
    })
  }

  for (const planet of planets) {
    await prisma.siriusPlanet.upsert({
      where: { name: planet.name },
      update: { ring: planet.ring, sortOrder: planet.sortOrder, isKnown: true },
      create: { ...planet, isKnown: true },
    })
  }

  for (const ship of ships) {
    const systemId = ship.system ? systemNames.get(ship.system) : undefined
    const createdShip = await prisma.ship.upsert({
      where: { name: ship.name },
      update: { className: ship.className, systemId },
      create: {
        name: ship.name,
        className: ship.className,
        systemId,
        source: 'Public BP checker seed',
      },
    })

    for (const requirementName of ship.requirements) {
      const blueprint = await prisma.blueprint.findUnique({ where: { canonicalName: requirementName } })
      if (!blueprint) {
        console.warn(`[seed] Missing blueprint for ship requirement: ${ship.name} -> ${requirementName}`)
        continue
      }
      await prisma.shipRequiredBlueprint.upsert({
        where: { shipId_blueprintId: { shipId: createdShip.id, blueprintId: blueprint.id } },
        update: {},
        create: { shipId: createdShip.id, blueprintId: blueprint.id },
      })
    }

    const requirementBlueprints = await prisma.blueprint.findMany({
      where: { canonicalName: { in: ship.requirements } },
      select: { id: true },
    })
    await prisma.shipRequiredBlueprint.deleteMany({
      where: {
        shipId: createdShip.id,
        blueprintId: { notIn: requirementBlueprints.map((blueprint) => blueprint.id) },
      },
    })
  }

  await prisma.importRun.create({
    data: {
      sourceType: 'SEED',
      status: 'APPLIED',
      sourceUrl: 'data/seeds',
      summaryJson: {
        blueprints: blueprints.length,
        siriusPlanets: planets.length,
        ships: ships.length,
        seededAt: new Date().toISOString(),
      },
      finishedAt: new Date(),
    },
  })

  console.log(`[seed] Seeded ${blueprints.length} blueprints, ${planets.length} planets, ${ships.length} ships.`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
