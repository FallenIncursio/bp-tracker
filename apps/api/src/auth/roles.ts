import type { ClanRole } from '../generated/prisma/client.js'

export const roleRank: Record<ClanRole, number> = {
  MEMBER: 1,
  LIEUTENANT: 2,
  COMMANDER: 3,
  ADMIRAL: 4,
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
