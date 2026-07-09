import type { BlueprintSlotGroup } from '../generated/prisma/client.js'

export const siriusResourcePartsByItem = {
  Aggrobeacon: [24, 23, 22, 21],
  Aggrobombe: [6, 6, 6, 6],
  Angriffsdroide: [16, 15, 15, 14],
  Angriffsfeldturm: [16, 15, 15, 14],
  Angriffsladung: [24, 23, 22, 21],
  Blaster: [6, 6, 6, 6],
  Dosenoeffner: [6, 6, 6, 6],
  Haftbombe: [6, 6, 6, 6],
  Materialisierer: [6, 6, 6, 6],
  Mine: [6, 6, 6, 6],
  Nachbrenner: [16, 15, 15, 14],
  Orbitalschlag: [6, 6, 6, 6],
  Perforator: [24, 23, 22, 21],
  Raketen: [6, 6, 6, 6],
  Reparaturdroide: [6, 6, 6, 6],
  Reparaturfeld: [6, 6, 6, 6],
  Reparaturfeldturm: [24, 23, 22, 21],
  Sammler: [24, 23, 22, 21],
  Schild: [6, 6, 6, 6],
  Schutz: [16, 15, 15, 14],
  Sniperblaster: [6, 6, 6, 6],
  Beschleuniger: [16, 15, 15, 14],
  Stunladung: [6, 6, 6, 6],
  Stundome: [6, 6, 6, 6],
  Taunt: [24, 23, 22, 21],
  Thermoblast: [6, 6, 6, 6],
  Zielcomputer: [16, 15, 15, 14],
  Zielreparatur: [24, 23, 22, 21],
  Zielscrambler: [16, 15, 15, 14],
} as const satisfies Record<string, readonly [number, number, number, number]>

export type SiriusResourceItemName = keyof typeof siriusResourcePartsByItem

export const siriusResourceItems = [
  { name: 'Blaster', itemType: 'Blaster' },
  { name: 'Sammler', itemType: 'Sammler' },
  { name: 'Reparaturdroide', itemType: 'Reparaturdroide' },
  { name: 'Nachbrenner', itemType: 'Nachbrenner' },
  { name: 'Raketen', itemType: 'Raketen' },
  { name: 'Zielcomputer', itemType: 'Zielcomputer' },
  { name: 'Perforator', itemType: 'Perforator' },
  { name: 'Thermoblast', itemType: 'Thermoblaster' },
  { name: 'Schild', itemType: 'Schild' },
  { name: 'Taunt', itemType: 'Taunt' },
  { name: 'Zielscrambler', itemType: 'Zielscrambler' },
  { name: 'Aggrobombe', itemType: 'Aggrobombe' },
  { name: 'Beschleuniger', itemType: 'Beschleuniger' },
  { name: 'Stunladung', itemType: 'Stunladung' },
  { name: 'Aggrobeacon', itemType: 'Aggrobeacon' },
  { name: 'Stundome', itemType: 'Stundome' },
  { name: 'Zielreparatur', itemType: 'Zielreparatur' },
  { name: 'Schutz', itemType: 'Protektor' },
  { name: 'Reparaturfeld', itemType: 'Reparaturfeld' },
  { name: 'Dosenoeffner', itemType: 'Dosenoeffner' },
  { name: 'Sniperblaster', itemType: 'Scharfschuetzenblaster' },
  { name: 'Angriffsdroide', itemType: 'Angriffsdroide' },
  { name: 'Orbitalschlag', itemType: 'Orbitalschlag' },
  { name: 'Angriffsladung', itemType: 'Angriffsladung' },
  { name: 'Reparaturfeldturm', itemType: 'Reparaturturm' },
  { name: 'Angriffsfeldturm', itemType: 'Angriffsturm' },
  { name: 'Haftbombe', itemType: 'Haftbombe' },
  { name: 'Materialisierer', itemType: 'Materialisierer' },
  { name: 'Mine', itemType: 'Minenleger' },
] as const satisfies ReadonlyArray<{ name: SiriusResourceItemName; itemType: string }>

export const siriusResourceParts = (itemName: SiriusResourceItemName, tierIndex: number) => siriusResourcePartsByItem[itemName][tierIndex]

export const siriusResourcePartOptionsByRing: Record<number, number[]> = {
  1: [24, 16, 6],
  2: [23, 15, 6],
  3: [22, 15, 6],
  4: [21, 14, 6],
}

export const partsRequiredBySlotGroup: Partial<Record<BlueprintSlotGroup, number>> = {
  SLOT_2: 2,
  SLOT_5: 5,
  SLOT_12: 12,
  SLOT_14: 14,
  SLOT_18: 18,
}
