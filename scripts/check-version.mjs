import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const readText = (relativePath) => readFileSync(path.join(rootDir, relativePath), 'utf8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))

const rootVersion = readJson('package.json').version
const failures = []

for (const packagePath of ['apps/api/package.json', 'apps/web/package.json', 'packages/contracts/package.json']) {
  const packageVersion = readJson(packagePath).version
  if (packageVersion !== rootVersion) {
    failures.push(`${packagePath} is ${packageVersion}, expected ${rootVersion}`)
  }
}

if (!readText('CHANGELOG.md').includes(`## ${rootVersion} - `)) {
  failures.push(`CHANGELOG.md does not contain a section for ${rootVersion}`)
}

if (failures.length > 0) {
  console.error(`Version check failed for ${rootVersion}:`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log(`Version check passed for ${rootVersion}`)
