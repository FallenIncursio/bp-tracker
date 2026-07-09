import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
config({ path: path.join(rootDir, '.env') })

const databaseUrl = process.env.DATABASE_URL
const directDatabaseUrl = process.env.DIRECT_DATABASE_URL
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL

export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(databaseUrl || directDatabaseUrl || shadowDatabaseUrl
    ? {
        datasource: {
          ...(databaseUrl || directDatabaseUrl ? { url: directDatabaseUrl ?? databaseUrl } : {}),
          ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}),
        },
      }
    : {}),
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
})
