/**
 * i18n/skillI18n.ts — connects skills.json bundle to SKILL_CATALOG entries.
 *
 * Strategy: SKILL_CATALOG is the canonical mechanical source (power, area,
 * effects). The PT-BR strings inside it (name, description) are kept as a
 * default fallback. After i18n init OR a language switch, this module walks
 * the catalog and overrides each skill's textual fields with the translated
 * value from the active locale bundle.
 *
 * Mirroring: right-side ids (rs, rw, re, rk) are mirrors of left-side ids
 * (ls, lw, le, lk) with identical mechanics. The skills.json file only stores
 * keys for the left-side ids; the helper canonicalizes a right-side id by
 * replacing the leading 'r' with 'l' before lookup.
 *
 * Mutation note: SkillDefinition fields are typed `readonly`, but JS does
 * not enforce that — the TS-level cast below is a deliberate workaround so
 * the existing consumer code (which reads `def.name`, `def.description`,
 * `def.longDescription`) keeps working without each call site changing.
 */

import { SKILL_CATALOG } from '../data/skillCatalog'
import { onLanguageChanged, t } from './index'

interface MutableSkillStrings {
  name: string
  description: string
  longDescription: string
}

function canonicalLeftId(id: string): string {
  // 'rs_a1' -> 'ls_a1', 'lw_d3' -> 'lw_d3'
  return id.startsWith('r') ? 'l' + id.slice(1) : id
}

export function applySkillI18n(): void {
  for (const skill of SKILL_CATALOG) {
    const leftId = canonicalLeftId(skill.id)
    const mut = skill as unknown as MutableSkillStrings

    const nameKey = `skills.${leftId}.name`
    const descKey = `skills.${leftId}.description`
    const longKey = `skills.${leftId}.long-description`

    const trName = t(nameKey)
    const trDesc = t(descKey)
    const trLong = t(longKey)

    // Only override when a translation actually exists. `t()` returns the
    // raw key as a sentinel for missing entries, so we compare against it
    // and fall back to the PT-BR value already present in the catalog.
    if (trName !== nameKey) mut.name = trName
    if (trDesc !== descKey) mut.description = trDesc
    if (trLong !== longKey) mut.longDescription = trLong
  }
}

let registered = false

/**
 * Idempotent: call once after `initI18n()` to seed the catalog and register
 * an auto-refresh listener for future language switches.
 */
export function registerSkillI18n(): void {
  applySkillI18n()
  if (!registered) {
    onLanguageChanged(() => applySkillI18n())
    registered = true
  }
}
