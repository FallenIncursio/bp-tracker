import type { Blueprint, BlueprintItemType, BlueprintItemTypeTranslation, BlueprintTranslation, GameSystem, Prisma } from '../generated/prisma/client.js'

export const blueprintSummaryInclude = {
  system: true,
  itemType: {
    include: {
      translations: {
        orderBy: { locale: 'asc' },
      },
    },
  },
  translations: {
    orderBy: { locale: 'asc' },
  },
} satisfies Prisma.BlueprintInclude

const serializeTranslation = (translation: BlueprintTranslation | BlueprintItemTypeTranslation) => ({
  locale: translation.locale,
  name: translation.name,
  source: translation.source,
  verified: translation.verified,
})

type BlueprintWithSummaryRelations = Blueprint & {
  system?: GameSystem | null
  itemType?: (BlueprintItemType & { translations?: BlueprintItemTypeTranslation[] }) | null
  translations?: BlueprintTranslation[]
}

export const serializeBlueprintSummary = (blueprint: BlueprintWithSummaryRelations) => ({
  id: blueprint.id,
  canonicalName: blueprint.canonicalName,
  nameDe: blueprint.nameDe,
  nameEn: blueprint.nameEn,
  translations: (blueprint.translations ?? []).map(serializeTranslation),
  systemName: blueprint.system?.name ?? null,
  itemTypeName: blueprint.itemType?.nameDe ?? null,
  itemTypeNameDe: blueprint.itemType?.nameDe ?? null,
  itemTypeNameEn: blueprint.itemType?.nameEn ?? null,
  itemTypeTranslations: (blueprint.itemType?.translations ?? []).map(serializeTranslation),
  slotGroup: blueprint.slotGroup,
  siriusRing: blueprint.siriusRing,
  siriusTechTier: blueprint.siriusTechTier,
  rarity: blueprint.rarity,
  partsRequired: blueprint.partsRequired,
  level: blueprint.level,
})
