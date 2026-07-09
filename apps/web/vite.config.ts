import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const rootPackage = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8')) as { version: string }
const githubUrl = process.env.VITE_GITHUB_URL ?? 'https://github.com/FallenIncursio/bp-tracker'

const readGit = (args: string[]) => {
  try {
    return execFileSync('git', args, { cwd: rootDir, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const commitSha = process.env.BP_TRACKER_COMMIT_SHA || readGit(['rev-parse', 'HEAD'])
const commitMessage = process.env.BP_TRACKER_COMMIT_MESSAGE || readGit(['log', '-1', '--pretty=%s'])
const commitDate = process.env.BP_TRACKER_COMMIT_DATE || readGit(['log', '-1', '--date=iso-strict', '--pretty=%cI'])
const commitUrl = process.env.BP_TRACKER_COMMIT_URL || (commitSha ? `${githubUrl.replace(/\/$/, '')}/commit/${commitSha}` : '')

export default defineConfig({
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPackage.version),
    __APP_COMMIT_SHA__: JSON.stringify(commitSha),
    __APP_COMMIT_MESSAGE__: JSON.stringify(commitMessage),
    __APP_COMMIT_DATE__: JSON.stringify(commitDate),
    __APP_COMMIT_URL__: JSON.stringify(commitUrl),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
