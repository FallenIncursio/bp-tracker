import { createApp } from './app.js'
import { env } from './utils/env.js'
import { prisma } from './utils/prisma.js'

const app = createApp()

const server = app.listen(env.port, () => {
  console.log(`BP Tracker API listening on http://localhost:${env.port}`)
})

const shutdown = async () => {
  server.close(async () => {
    await prisma.$disconnect()
    process.exit(0)
  })
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())

