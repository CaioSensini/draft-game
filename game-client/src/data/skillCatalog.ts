/**
 * data/skillCatalog.ts — the canonical source of truth for all skill definitions.
 *
 * This file is PURE DATA — no imports from the engine, no `new Skill()` calls.
 * Every object here is a plain SkillDefinition that can be loaded, validated,
 * serialised to JSON, or sent over the network without any transformation.
 *
 * Adding a new skill to the game:
 *   1. Append a new entry to SKILL_CATALOG below.
 *   2. Reference its `id` in data/deckAssignments.ts if you want it in a deck.
 *   3. No engine, registry, or BattleSim changes required.
 *
 * Fields:
 *   range       — max tile distance (0 = unrestricted)
 *   areaRadius  — AoE radius in tiles (only meaningful for area skills)
 *   areaShape   — explicit hit-pattern (overrides areaRadius when present)
 *   secondaryEffect — optional combo: a second status applied after the primary,
 *                     only if the hit was not evaded and target survived.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Catalog structure
 *
 *   Each role has exactly 8 skills:
 *     attack1  (2 skills) — high-damage / sustain attacks
 *     attack2  (2 skills) — control / debuff attacks
 *     defense1 (2 skills) — strong defensive abilities
 *     defense2 (2 skills) — light defensive abilities
 *
 *   Wait — actually each role has 16 skills per side (4 per group), but both
 *   sides share the same mechanics with different ID prefixes:
 *     Left side:  lk_ (king), lw_ (warrior), le_ (executor), ls_ (specialist)
 *     Right side: rk_ (king), rw_ (warrior), re_ (executor), rs_ (specialist)
 *
 *   Total: 4 roles x 16 skills x 2 sides = 128 entries
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Catalog sections
 *   [1] SPECIALIST skills   (ids: ls_* / rs_*)
 *   [2] WARRIOR skills      (ids: lw_* / rw_*)
 *   [3] EXECUTOR skills     (ids: le_* / re_*)
 *   [4] KING skills         (ids: lk_* / rk_*)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { SkillDefinition } from '../domain/Skill'

// ── Helper: duplicate a set of skill definitions for the right side ──────────
// Replaces the left-side prefix (lk_, lw_, le_, ls_) with the corresponding
// right-side prefix (rk_, rw_, re_, rs_). All mechanics stay identical.
function mirror(skills: SkillDefinition[]): SkillDefinition[] {
  return skills.map((s) => ({
    ...s,
    id: s.id.replace(/^l/, 'r'),
  }))
}

// ══════════════════════════════════════════════════════════════════════════════
// [1] SPECIALIST — Mage / support caster
//     Role: AoE magic damage, crowd control, healing, buffs
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_SPECIALIST: SkillDefinition[] = [
  // ── attack1 (high damage) ──────────────────────────────────────────────────
  {
    id: 'ls_a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 32, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'burn', power: 7, ticks: 1 },
    description: 'Causa 32 de dano em area 3x3. Aplica queimacao por 1 turno (7 dano/turno).',
  },
  {
    id: 'ls_a2', name: 'Chuva de Mana', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 30, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 2 },
    description: 'Causa 30 de dano em linha reta de 3 tiles. Atinge todos no caminho.',
  },
  {
    id: 'ls_a3', name: 'Raio Purificador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 27, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Causa 27 de dano em linha de 7 tiles. Remove buffs de todos os atingidos.',
  },
  {
    id: 'ls_a4', name: 'Explosao Central', category: 'attack', group: 'attack1',
    effectType: 'mark', targetType: 'single', power: 45, range: 0,
    description: '1o uso: marca o alvo. 2o uso no alvo marcado: causa dano bonus (50% do power).',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'ls_a5', name: 'Orbe de Lentidao', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 1 },
    description: 'Causa 15 de dano em area 3x3. Reduz DEF dos atingidos em 20 por 1 turno.',
  },
  {
    id: 'ls_a6', name: 'Correntes Rigidas', category: 'attack', group: 'attack2',
    effectType: 'snare', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'Causa 12 de dano e prende inimigos em area diamante. Impede movimento por 1 turno.',
  },
  {
    id: 'ls_a7', name: 'Nevoa', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 8, range: 0,
    areaShape: { type: 'square', radius: 7 },
    secondaryEffect: { effectType: 'poison', power: 0, ticks: 2 },
    description: 'Causa 8 de dano em area total (15x15). Aplica veneno por 2 turnos (1 dano/turno).',
  },
  {
    id: 'ls_a8', name: 'Congelamento', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 23, range: 0,
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 1 },
    description: 'Atordoa 1 inimigo por 1 turno. Causa 23 de dano e reduz DEF em 20 por 1 turno.',
  },

  // ── defense1 (strong defense) ──────────────────────────────────────────────
  {
    id: 'ls_d1', name: 'Cura Suprema', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'lowest_ally', power: 65,
    description: 'Cura 65 HP do aliado com menor vida.',
  },
  {
    id: 'ls_d2', name: 'Renascimento Parcial', category: 'defense', group: 'defense1',
    effectType: 'revive', targetType: 'lowest_ally', power: 40,
    description: 'Concede revive ao aliado com menor HP. Se morrer, renasce com 40 HP.',
  },
  {
    id: 'ls_d3', name: 'Campo de Cura', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'area', power: 20, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'shield', power: 15, ticks: 1 },
    description: 'Cura 20 HP dos aliados em area 3x3. Concede 15 de shield por 1 turno.',
  },
  {
    id: 'ls_d4', name: 'Protecao', category: 'defense', group: 'defense1',
    effectType: 'cleanse', targetType: 'area', power: 0, range: 0,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'Remove todos os debuffs dos aliados em area diamante. Nao causa dano.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'ls_d5', name: 'Campo de Cura Continuo', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Aplica regeneracao de 12 HP/turno em area 3x3. Dura enquanto ativo.',
  },
  {
    id: 'ls_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque completamente. Nao recebe dano neste turno.',
  },
  {
    id: 'ls_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 80,
    description: 'Concede 80 de shield ao especialista. Absorve dano ate acabar.',
  },
  {
    id: 'ls_d8', name: 'Aura de Protecao', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffect: { effectType: 'atk_up', power: 10, ticks: 1 },
    description: 'Concede 15 de shield em area diamante. Aumenta ATK dos aliados em 10 por 1 turno.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [2] WARRIOR — Tank / frontline bruiser
//     Role: AoE disruption, big shields, team defense
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_WARRIOR: SkillDefinition[] = [
  // ── attack1 (high damage) ──────────────────────────────────────────────────
  {
    id: 'lw_a1', name: 'Colisao Titanica', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 24, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 5 },
    secondaryEffect: { effectType: 'push', power: 1 },
    description: 'Causa 24 de dano em linha de 6 tiles. Empurra os atingidos 1 tile para tras.',
  },
  {
    id: 'lw_a2', name: 'Impacto', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 30, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'def_down', power: 18, ticks: 1 },
    description: 'Causa 30 de dano em area 3x3. Reduz DEF dos atingidos em 18 por 1 turno.',
  },
  {
    id: 'lw_a3', name: 'Golpe Devastador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 28, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Causa 28 de dano em area 3x3. Remove buffs e shields dos inimigos atingidos.',
  },
  {
    id: 'lw_a4', name: 'Investida Brutal', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 27, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'push', power: 1 },
    description: 'Causa 27 de dano em linha de 7 tiles. Empurra os atingidos 1 tile para tras.',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'lw_a5', name: 'Provocacao', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 18, range: 0,
    secondaryEffect: { effectType: 'silence_defense', power: 0, ticks: 1 },
    description: 'Causa 18 de dano em 1 inimigo. Bloqueia a skill de defesa dele no proximo turno.',
  },
  {
    id: 'lw_a6', name: 'Muralha Viva', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 11, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 1 },
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 2 },
    description: 'Causa 11 de dano em linha de 2 tiles. Reduz DEF dos atingidos em 20 por 2 turnos.',
  },
  {
    id: 'lw_a7', name: 'Investida', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'def_down', power: 15, ticks: 1 },
    description: 'Causa 15 de dano em linha de 7 tiles. Reduz DEF dos atingidos em 15 por 1 turno.',
  },
  {
    id: 'lw_a8', name: 'Prisao de Muralha Morta', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'ring', radius: 1 },
    secondaryEffect: { effectType: 'snare', power: 0, ticks: 2 },
    description: 'Causa 15 de dano em anel ao redor do alvo. Prende os atingidos por 2 turnos.',
  },

  // ── defense1 (strong defense) ──────────────────────────────────────────────
  {
    id: 'lw_d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 70,
    description: 'Concede 70 de shield ao guerreiro. Absorve dano ate acabar.',
  },
  {
    id: 'lw_d2', name: 'Guardiao', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'lowest_ally', power: 50,
    description: 'Concede 50 de shield ao aliado com menor HP. Absorve dano ate acabar.',
  },
  {
    id: 'lw_d3', name: 'Resistencia Absoluta', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 80,
    secondaryEffect: { effectType: 'def_up', power: 25, ticks: 1 },
    description: 'Concede 80 de shield e aumenta DEF em 25 por 1 turno. Defesa total.',
  },
  {
    id: 'lw_d4', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 75,
    secondaryEffect: { effectType: 'stun', power: 0, ticks: 1 },
    description: 'Concede 75 de shield. Custo: o guerreiro fica imobilizado por 1 turno.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'lw_d5', name: 'Escudo de Grupo', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'all_allies', power: 20,
    description: 'Concede 20 de shield a todos os aliados. Protecao distribuida.',
  },
  {
    id: 'lw_d6', name: 'Postura Defensiva', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Concede 25 de shield aos aliados em area 3x3.',
  },
  {
    id: 'lw_d7', name: 'Avancar', category: 'defense', group: 'defense2',
    effectType: 'advance_allies', targetType: 'all_allies', power: 10,
    secondaryEffect: { effectType: 'atk_up', power: 10, ticks: 1 },
    description: 'Move todos aliados 1 casa para frente. Aumenta DEF em 10 e ATK em 10 por 1 turno.',
  },
  {
    id: 'lw_d8', name: 'Bater em Retirada', category: 'defense', group: 'defense1',
    effectType: 'retreat_allies', targetType: 'all_allies', power: 20,
    description: 'Move todos aliados 1 casa para tras. Aumenta DEF em 20 por 1 turno.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [3] EXECUTOR — Assassin / DPS
//     Role: single-target burst, bleeds, self-buffs
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_EXECUTOR: SkillDefinition[] = [
  // ── attack1 (high damage) ──────────────────────────────────────────────────
  {
    id: 'le_a1', name: 'Corte Mortal', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 60, range: 0,
    description: 'Causa 60 de dano em 1 alvo. Ataque direto de alto impacto.',
  },
  {
    id: 'le_a2', name: 'Tempestade de Laminas', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 32, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Causa 32 de dano em area 3x3. Atinge todos os inimigos na area.',
  },
  {
    id: 'le_a3', name: 'Disparo Preciso', category: 'attack', group: 'attack1',
    effectType: 'true_damage', targetType: 'single', power: 41, range: 0,
    description: 'Causa 41 de dano verdadeiro (ignora DEF). Nao escala com ATK.',
  },
  {
    id: 'le_a4', name: 'Corte Preciso', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area', power: 27, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 1 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Causa 27 de dano em linha de 2 tiles. Remove buffs dos atingidos.',
  },

  // ── attack2 (control — bleeds) ─────────────────────────────────────────────
  {
    id: 'le_a5', name: 'Corte Hemorragia', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 11, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 1 },
    description: 'Causa dano e aplica sangramento (4 dano/turno) em linha de 2 tiles por 3 turnos.',
  },
  {
    id: 'le_a6', name: 'Bomba de Espinhos', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffect: { effectType: 'bleed', power: 10, ticks: 2 },
    description: 'Causa dano e aplica sangramento (5 dano/turno por 3 turnos) em area diamante. Extra: 4 dano/turno por 2 turnos.',
  },
  {
    id: 'le_a7', name: 'Marca da Morte', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 3 },
    secondaryEffect: { effectType: 'bleed', power: 10, ticks: 2 },
    description: 'Causa 15 de dano em linha de 4 tiles. Aplica sangramento: 10 dano/turno por 2 turnos.',
  },
  {
    id: 'le_a8', name: 'Armadilha Oculta', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 18, range: 0,
    secondaryEffect: { effectType: 'bleed', power: 12, ticks: 3 },
    description: 'Causa 18 de dano em 1 alvo. Aplica sangramento: 5 dano/turno por 3 turnos.',
  },

  // ── defense1 (strong defense — self-buffs) ─────────────────────────────────
  {
    id: 'le_d1', name: 'Refletir', category: 'defense', group: 'defense1',
    effectType: 'reflect', targetType: 'self', power: 25,
    description: 'Reflete 25 de dano ao proximo atacante. O executor ainda recebe o dano.',
  },
  {
    id: 'le_d2', name: 'Adrenalina', category: 'defense', group: 'defense1',
    effectType: 'atk_up', targetType: 'self', power: 30,
    description: 'Aumenta ATK em 30 por 3 turnos.',
  },
  {
    id: 'le_d3', name: 'Ataque em Dobro', category: 'defense', group: 'defense1',
    effectType: 'double_attack', targetType: 'self', power: 0,
    description: 'Permite usar 2 skills de ataque no proximo turno (sem defesa).',
  },
  {
    id: 'le_d4', name: 'Teleport', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque. O executor se reposiciona.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'le_d5', name: 'Recuo Rapido', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 25,
    description: 'Concede 25 de shield ao executor. Absorve dano ate acabar.',
  },
  {
    id: 'le_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque completamente. Nao recebe dano neste turno.',
  },
  {
    id: 'le_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 75,
    description: 'Concede 75 de shield ao executor. Absorve dano ate acabar.',
  },
  {
    id: 'le_d8', name: 'Shield', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 30,
    description: 'Concede 30 de shield ao executor. Protecao basica.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [4] KING — Leader / sustain fighter
//     Role: sustained damage, self-heal, self-shields, control
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_KING: SkillDefinition[] = [
  // ── attack1 (sustain damage) ───────────────────────────────────────────────
  {
    id: 'lk_a1', name: 'Soco Real', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 30, range: 0,
    description: 'Causa 30 de dano em 1 alvo. Passiva do rei: ganha shield ao atacar.',
  },
  {
    id: 'lk_a2', name: 'Chute Real', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 32, range: 0,
    description: 'Causa 32 de dano em 1 alvo. Passiva do rei: ganha shield ao atacar.',
  },
  {
    id: 'lk_a3', name: 'Sequencia de Socos', category: 'attack', group: 'attack1',
    effectType: 'lifesteal', targetType: 'area', power: 21, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Causa 21 de dano em area 3x3 com lifesteal. Cura 21% do dano causado.',
  },
  {
    id: 'lk_a4', name: 'Dominio Real', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 21, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Causa 21 de dano em area 3x3. Atinge todos os inimigos na area.',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'lk_a5', name: 'Empurrao Real', category: 'attack', group: 'attack2',
    effectType: 'push', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    description: 'Causa 15 de dano em linha de 7 tiles. Empurra os inimigos ate 5 tiles para tras.',
  },
  {
    id: 'lk_a6', name: 'Contra-ataque', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'push', power: 1 },
    description: 'Causa 15 de dano em area 3x3. Empurra os atingidos para longe do centro.',
  },
  {
    id: 'lk_a7', name: 'Intimidacao', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 15, range: 0,
    description: 'Atordoa 1 inimigo por 1 turno. Causa 15 de dano.',
  },
  {
    id: 'lk_a8', name: 'Desarme', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 8, range: 0,
    description: 'Atordoa 1 inimigo por 1 turno. Causa 8 de dano e impede todas as acoes dele.',
  },

  // ── defense1 (strong defense — self-sustain) ───────────────────────────────
  {
    id: 'lk_d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque completamente. Nao recebe dano neste turno.',
  },
  {
    id: 'lk_d2', name: 'Recuperacao Real', category: 'defense', group: 'defense1',
    effectType: 'regen', targetType: 'self', power: 20,
    description: 'Aplica regeneracao de 20 HP/turno no rei por 3 turnos.',
  },
  {
    id: 'lk_d3', name: 'Sombra Real', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque. Funciona como uma segunda esquiva.',
  },
  {
    id: 'lk_d4', name: 'Espirito de Sobrevivencia', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'self', power: 35,
    description: 'Cura 35 HP do rei instantaneamente. Self-heal de emergencia.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'lk_d5', name: 'Escudo Self', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 25,
    description: 'Concede 25 de shield ao rei. Absorve dano ate acabar.',
  },
  {
    id: 'lk_d6', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 75,
    description: 'Concede 75 de shield ao rei. Absorve dano ate acabar.',
  },
  {
    id: 'lk_d7', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva o proximo ataque completamente. Nao recebe dano neste turno.',
  },
  {
    id: 'lk_d8', name: 'Ordem Real', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 20,
    secondaryEffect: { effectType: 'def_up', power: 15, ticks: 1 },
    description: 'Concede 20 de shield e aumenta DEF do rei em 15 por 1 turno.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// Assemble the full catalog: left-side originals + right-side mirrors
// ══════════════════════════════════════════════════════════════════════════════

export const SKILL_CATALOG: SkillDefinition[] = [
  ...LEFT_SPECIALIST,
  ...mirror(LEFT_SPECIALIST),
  ...LEFT_WARRIOR,
  ...mirror(LEFT_WARRIOR),
  ...LEFT_EXECUTOR,
  ...mirror(LEFT_EXECUTOR),
  ...LEFT_KING,
  ...mirror(LEFT_KING),
]
