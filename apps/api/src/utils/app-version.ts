import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageJson = {
  name?: string
  version?: string
}

const findRootPackageVersion = () => {
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))]

  for (const start of starts) {
    let current = start
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, 'package.json')
      if (existsSync(candidate)) {
        try {
          const packageJson = JSON.parse(readFileSync(candidate, 'utf8')) as PackageJson
          if (packageJson.name === 'bp-tracker' && packageJson.version) return packageJson.version
        } catch {
          // Keep walking; a malformed adjacent package.json should not prevent startup.
        }
      }
      current = path.dirname(current)
    }
  }

  return '0.0.0'
}

export const appVersion = process.env.BP_TRACKER_VERSION ?? findRootPackageVersion()
