#!/usr/bin/env node
/**
 * copy-lucide-icons.mjs
 *
 * Copies a curated subset of Lucide SVG icons from `node_modules/lucide-static`
 * into `public/assets/icons/ui/`. Run via `npm run assets:lucide` (added to
 * package.json). Public assets are served directly by Vite / Phaser's SVG
 * loader — the package itself is NOT bundled (stays in node_modules).
 *
 * Edit LUCIDE_ICONS below to add/remove icons.
 *
 * Rationale: `lucide-static` ships 5300+ SVGs (~45 MB unpacked). We only need
 * ~15 for BattleScene core UI, so copying them to public keeps the bundle
 * lean while allowing easy updates by re-running this script.
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, '..', 'node_modules', 'lucide-static', 'icons')
const DEST_DIR = resolve(__dirname, '..', 'public', 'assets', 'icons', 'ui')

const LUCIDE_ICONS = [
  // Core UI (Sub 1.9 replacements)
  'arrow-left',
  'flag',
  'x',
  'settings',
  'timer',
  // Skill-domain icons (preloaded for future tooltip / card use)
  'swords',
  'shield',
  'heart-pulse',
  'droplet',
  'flame',
  'snowflake',
  'zap',
  'wind',
  'crown',
]

if (!existsSync(SRC_DIR)) {
  console.error(`✖ Source folder not found: ${SRC_DIR}`)
  console.error('  Run `npm i -D lucide-static` first.')
  process.exit(1)
}

mkdirSync(DEST_DIR, { recursive: true })

let okCount = 0
let missCount = 0
for (const name of LUCIDE_ICONS) {
  const src = resolve(SRC_DIR, `${name}.svg`)
  const dest = resolve(DEST_DIR, `${name}.svg`)
  if (!existsSync(src)) {
    console.error(`✖ Missing source icon: ${name}.svg`)
    missCount++
    continue
  }
  cpSync(src, dest)
  okCount++
}

console.log(`✔ Copied ${okCount} icon(s) to ${DEST_DIR}`)
if (missCount > 0) {
  console.error(`✖ ${missCount} icon(s) missing — see errors above`)
  process.exit(1)
}
