import type { ClanMembership, User } from '../generated/prisma/client.js'

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: User & { memberships: ClanMembership[] }
        sessionToken?: string
      }
    }
  }
}

export {}

