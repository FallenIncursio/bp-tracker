import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const readText = (relativePath) =>
  readFileSync(path.join(rootDir, relativePath), "utf8");
const readJson = (relativePath) => JSON.parse(readText(relativePath));

const rootVersion = readJson("package.json").version;
const failures = [];
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

for (const packagePath of [
  "apps/api/package.json",
  "apps/web/package.json",
  "packages/contracts/package.json",
]) {
  const packageVersion = readJson(packagePath).version;
  if (packageVersion !== rootVersion) {
    failures.push(
      `${packagePath} is ${packageVersion}, expected ${rootVersion}`,
    );
  }
}

const stringChecks = [
  [".env.example", `VITE_APP_VERSION=${rootVersion}`],
  [".env.example.docker", `VITE_APP_VERSION=${rootVersion}`],
  [
    "docker-compose.dev.yml",
    `VITE_APP_VERSION: ${"${"}VITE_APP_VERSION:-${rootVersion}}`,
  ],
  [
    "docker-compose.prod.yml",
    `VITE_APP_VERSION: ${"${"}VITE_APP_VERSION:-${rootVersion}}`,
  ],
  ["apps/web/src/App.vue", `?? '${rootVersion}'`],
  ["apps/web/src/pages/AboutPage.vue", `?? '${rootVersion}'`],
  ["apps/api/src/openapi/spec.ts", `version: '${rootVersion}'`],
  [
    "docs/configuration.md",
    new RegExp(
      `\\|\\s*\`VITE_APP_VERSION\`\\s*\\|\\s*\`${escapeRegExp(rootVersion)}\`\\s*\\|`,
    ),
  ],
];

for (const [relativePath, expected] of stringChecks) {
  const content = readText(relativePath);
  const matches =
    expected instanceof RegExp
      ? expected.test(content)
      : content.includes(expected);
  if (!matches) {
    failures.push(`${relativePath} does not contain "${expected}"`);
  }
}

if (failures.length > 0) {
  console.error(`Version check failed for ${rootVersion}:`);
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Version check passed for ${rootVersion}`);
