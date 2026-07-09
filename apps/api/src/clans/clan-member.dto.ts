import type { ClanMembership, User } from '../generated/prisma/client.js'

type ClanMemberWithUser = ClanMembership & {
  user: Pick<User, 'displayName' | 'username'>
}

export const serializeClanMember = (membership: ClanMemberWithUser, canManage: boolean) => {
  const member = {
    userId: membership.userId,
    displayName: membership.user.displayName,
    role: membership.role,
    status: membership.status,
    trackingExcluded: membership.trackingExcluded,
  }

  if (!canManage) {
    return member
  }

  return {
    ...member,
    username: membership.user.username,
    trackingExcludedAt: membership.trackingExcludedAt,
    trackingExcludedReason: membership.trackingExcludedReason,
    approvedAt: membership.approvedAt,
  }
}
