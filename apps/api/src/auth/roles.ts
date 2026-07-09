import type { ClanRole } from '../generated/prisma/client.js'

export const roleRank: Record<ClanRole, number> = {
  MEMBER: 1,
  COMMANDER: 2,
  ADMIRAL: 3,
}

export const canSetClanRole = (actorRole: ClanRole | 'ADMIN' | null, targetRole: ClanRole) => {
  if (actorRole === 'ADMIN') {
    return true
  }
  if (actorRole === 'ADMIRAL') {
    return targetRole !== 'ADMIRAL'
  }
  return false
}

