import { PrismaClient } from '../generated/prisma/client.js'
import { PrismaPg } from '@prisma/adapter-pg'
import { env } from './env.js'

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required.')
}

const globalForPrisma = globalThis as typeof globalThis & { bpTrackerPrisma?: PrismaClient }

export const prisma =
  globalForPrisma.bpTrackerPrisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.databaseUrl }),
  })

if (env.nodeEnv !== 'production') {
  globalForPrisma.bpTrackerPrisma = prisma
}

