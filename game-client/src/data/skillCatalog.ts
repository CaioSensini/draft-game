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
    effectType: 'area', targetType: 'area', power: 32, range: 7,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'burn', power: 10, ticks: 1 },
    description: 'Lanca uma bola de fogo que explode em area 2x2, causando queimadura.',
  },
  {
    id: 'ls_a2', name: 'Chuva de Mana', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 30, range: 8,
    areaShape: { type: 'line', direction: 'east', length: 3 },
    description: 'Chuva magica em linha reta que distribui dano ao longo do caminho.',
  },
  {
    id: 'ls_a3', name: 'Raio Purificador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 28, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Raio que atravessa a arena inimiga, removendo buffs de todos no caminho.',
  },
  {
    id: 'ls_a4', name: 'Explosao Central', category: 'attack', group: 'attack1',
    effectType: 'mark', targetType: 'single', power: 42, range: 6,
    description: 'Marca o alvo na primeira vez. Se o alvo ja estiver marcado, causa dano massivo verdadeiro.',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'ls_a5', name: 'Orbe de Lentidao', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 7,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 1 },
    description: 'Orbe que explode em area 3x3, reduzindo a defesa dos atingidos.',
  },
  {
    id: 'ls_a6', name: 'Correntes Rigidas', category: 'attack', group: 'attack2',
    effectType: 'snare', targetType: 'area', power: 12, range: 6,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'Correntes magicas que atordoam inimigos em area cruzada.',
  },
  {
    id: 'ls_a7', name: 'Nevoa', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 5, range: 0,
    areaShape: { type: 'square', radius: 7 },
    secondaryEffect: { effectType: 'poison', power: 0, ticks: 2 },
    description: 'Nevoa toxica que cobre toda a area inimiga, reduzindo a cura recebida.',
  },
  {
    id: 'ls_a8', name: 'Congelamento', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 15, range: 6,
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 1 },
    description: 'Congela um alvo, impedindo sua acao e reduzindo sua defesa.',
  },

  // ── defense1 (strong defense) ──────────────────────────────────────────────
  {
    id: 'ls_d1', name: 'Cura Suprema', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'lowest_ally', power: 65,
    description: 'Cura massiva no aliado com menor HP. Nao pode ser usada no rei.',
  },
  {
    id: 'ls_d2', name: 'Renascimento Parcial', category: 'defense', group: 'defense1',
    effectType: 'revive', targetType: 'lowest_ally', power: 40,
    description: 'Concede um grande escudo ao aliado mais fraco, simulando um buffer de renascimento.',
  },
  {
    id: 'ls_d3', name: 'Campo de Cura', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'area', power: 20, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'shield', power: 15, ticks: 1 },
    description: 'Cria um campo de cura em area 3x3 que tambem concede escudo temporario.',
  },
  {
    id: 'ls_d4', name: 'Protecao', category: 'defense', group: 'defense1',
    effectType: 'cleanse', targetType: 'area', power: 0, range: 0,
    areaShape: { type: 'diamond', radius: 1 },
    description: 'Remove todos os debuffs dos aliados em area cruzada.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'ls_d5', name: 'Campo de Cura Continuo', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Cria um campo de regeneracao continua em area 3x3.',
  },
  {
    id: 'ls_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva do proximo ataque recebido.',
  },
  {
    id: 'ls_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 100,
    description: 'Escudo massivo que bloqueia o proximo ataque completamente.',
  },
  {
    id: 'ls_d8', name: 'Aura de Protecao', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffect: { effectType: 'atk_up', power: 10, ticks: 1 },
    description: 'Aura protetora em area diamante que concede escudo e aumenta o ataque dos aliados.',
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
    effectType: 'area', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'snare', power: 0, ticks: 1 },
    description: 'Carga devastadora em linha 6x2 que empurra e atordoa inimigos no caminho.',
  },
  {
    id: 'lw_a2', name: 'Impacto', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 30, range: 5,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'def_down', power: 18, ticks: 1 },
    description: 'Impacto no chao que causa dano em area 3x3 e reduz a defesa dos atingidos.',
  },
  {
    id: 'lw_a3', name: 'Golpe Devastador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 35, range: 4,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Golpe poderoso em area 2x2 que destroi escudos e remove buffs inimigos.',
  },
  {
    id: 'lw_a4', name: 'Investida Brutal', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 28, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'snare', power: 0, ticks: 1 },
    description: 'Investida em linha que atravessa a arena, atordoando todos no caminho.',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'lw_a5', name: 'Provocacao', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 18, range: 5,
    secondaryEffect: { effectType: 'silence_defense', power: 0, ticks: 1 },
    description: 'Provoca um inimigo, causando dano leve e bloqueando sua skill de defesa no proximo turno.',
  },
  {
    id: 'lw_a6', name: 'Muralha Viva', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 10, range: 6,
    areaShape: { type: 'line', direction: 'north', length: 2 },
    secondaryEffect: { effectType: 'def_down', power: 20, ticks: 2 },
    description: 'Cria uma muralha de impacto que causa dano e reduz a defesa por 2 turnos.',
  },
  {
    id: 'lw_a7', name: 'Investida', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffect: { effectType: 'def_down', power: 15, ticks: 1 },
    description: 'Investida em linha pela arena, reduzindo a defesa dos inimigos atingidos.',
  },
  {
    id: 'lw_a8', name: 'Prisao de Muralha Morta', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 6,
    areaShape: { type: 'ring', radius: 1 },
    secondaryEffect: { effectType: 'snare', power: 0, ticks: 2 },
    description: 'Cria um anel de muralhas ao redor da area, prendendo e atordoando inimigos.',
  },

  // ── defense1 (strong defense) ──────────────────────────────────────────────
  {
    id: 'lw_d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 70,
    description: 'Escudo pesado que absorve grande quantidade de dano.',
  },
  {
    id: 'lw_d2', name: 'Guardiao', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'lowest_ally', power: 50,
    description: 'Concede um escudo protetor ao aliado com menor HP, absorvendo dano por ele.',
  },
  {
    id: 'lw_d3', name: 'Resistencia Absoluta', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 80,
    secondaryEffect: { effectType: 'def_up', power: 25, ticks: 1 },
    description: 'Escudo massivo com grande aumento de defesa. Quase invulneravel por 1 turno.',
  },
  {
    id: 'lw_d4', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 95,
    secondaryEffect: { effectType: 'stun', power: 0, ticks: 1 },
    description: 'Escudo absoluto com 90% de mitigacao. O guerreiro nao pode se mover no proximo turno.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'lw_d5', name: 'Escudo de Grupo', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'all_allies', power: 20,
    description: 'Escudo leve para todos os aliados.',
  },
  {
    id: 'lw_d6', name: 'Postura Defensiva', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Aliados em area 3x3 recebem um escudo protetor.',
  },
  {
    id: 'lw_d7', name: 'Avancar', category: 'defense', group: 'defense2',
    effectType: 'def_up', targetType: 'all_allies', power: 10,
    secondaryEffect: { effectType: 'atk_up', power: 10, ticks: 1 },
    description: 'Comando de avanco: todos os aliados ganham aumento de defesa e ataque.',
  },
  {
    id: 'lw_d8', name: 'Bater em Retirada', category: 'defense', group: 'defense1',
    effectType: 'def_up', targetType: 'all_allies', power: 20,
    description: 'Comando de retirada: todos os aliados ganham aumento de defesa.',
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
    effectType: 'damage', targetType: 'single', power: 75, range: 4,
    description: 'Corte letal. Causa dano extra se o alvo estiver sangrando.',
  },
  {
    id: 'le_a2', name: 'Tempestade de Laminas', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 32, range: 5,
    areaShape: { type: 'square', radius: 1 },
    description: 'Furia de laminas que atinge todos em area 3x3.',
  },
  {
    id: 'le_a3', name: 'Disparo Preciso', category: 'attack', group: 'attack1',
    effectType: 'true_damage', targetType: 'single', power: 45, range: 6,
    description: 'Disparo que ignora defesa. Se o alvo estiver sangrando, ignora escudo tambem.',
  },
  {
    id: 'le_a4', name: 'Corte Preciso', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area', power: 28, range: 4,
    areaShape: { type: 'line', direction: 'east', length: 2 },
    secondaryEffect: { effectType: 'purge', power: 0 },
    description: 'Corte horizontal preciso que remove buffs dos inimigos atingidos.',
  },

  // ── attack2 (control — bleeds) ─────────────────────────────────────────────
  {
    id: 'le_a5', name: 'Corte Hemorragia', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 10, range: 4,
    areaShape: { type: 'line', direction: 'east', length: 2 },
    description: 'Corte profundo em area horizontal que causa hemorragia permanente.',
  },
  {
    id: 'le_a6', name: 'Bomba de Espinhos', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 12, range: 6,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffect: { effectType: 'bleed', power: 10, ticks: 2 },
    description: 'Bomba que espalha espinhos em area diamante, causando sangramento prolongado.',
  },
  {
    id: 'le_a7', name: 'Marca da Morte', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 6,
    areaShape: { type: 'square', radius: 2 },
    secondaryEffect: { effectType: 'bleed', power: 10, ticks: 2 },
    description: 'Marca uma grande area retangular, causando dano e sangramento aos atingidos.',
  },
  {
    id: 'le_a8', name: 'Armadilha Oculta', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 18, range: 6,
    secondaryEffect: { effectType: 'bleed', power: 12, ticks: 3 },
    description: 'Armadilha invisivel que causa dano e sangramento prolongado ao alvo.',
  },

  // ── defense1 (strong defense — self-buffs) ─────────────────────────────────
  {
    id: 'le_d1', name: 'Refletir', category: 'defense', group: 'defense1',
    effectType: 'reflect', targetType: 'self', power: 25,
    description: 'Reflete parte do proximo ataque recebido de volta ao atacante.',
  },
  {
    id: 'le_d2', name: 'Adrenalina', category: 'defense', group: 'defense1',
    effectType: 'atk_up', targetType: 'self', power: 40,
    description: 'Surto de adrenalina que aumenta o dano em 50% por 1 turno.',
  },
  {
    id: 'le_d3', name: 'Ataque em Dobro', category: 'defense', group: 'defense1',
    effectType: 'double_attack', targetType: 'self', power: 0,
    description: 'Permite usar 2 skills de ataque no proximo turno (sem skill de defesa).',
  },
  {
    id: 'le_d4', name: 'Teleport', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Teleporta para outra posicao, esquivando do proximo ataque.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'le_d5', name: 'Recuo Rapido', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 25,
    description: 'Recua rapidamente, ganhando um escudo leve de protecao.',
  },
  {
    id: 'le_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva do proximo ataque recebido.',
  },
  {
    id: 'le_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 90,
    description: 'Escudo massivo que bloqueia o proximo ataque completamente.',
  },
  {
    id: 'le_d8', name: 'Shield', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 30,
    description: 'Escudo medio de protecao.',
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
    effectType: 'damage', targetType: 'single', power: 30, range: 3,
    description: 'Soco direto do rei. Passiva do rei concede escudo ao atacar.',
  },
  {
    id: 'lk_a2', name: 'Chute Real', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 32, range: 3,
    description: 'Chute poderoso do rei. Passiva do rei concede escudo ao atacar.',
  },
  {
    id: 'lk_a3', name: 'Sequencia de Socos', category: 'attack', group: 'attack1',
    effectType: 'lifesteal', targetType: 'area', power: 22, range: 4,
    areaShape: { type: 'square', radius: 1 },
    description: 'Sequencia rapida de socos em area 3x2, cura 20% de todo dano causado.',
  },
  {
    id: 'lk_a4', name: 'Dominio Real', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 22, range: 5,
    areaShape: { type: 'square', radius: 1 },
    description: 'Demonstracao de dominio real em area 3x3, intimidando os inimigos.',
  },

  // ── attack2 (control) ──────────────────────────────────────────────────────
  {
    id: 'lk_a5', name: 'Empurrao Real', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    description: 'Onda de forca real que empurra inimigos em linha pela arena.',
  },
  {
    id: 'lk_a6', name: 'Contra-ataque', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 4,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffect: { effectType: 'stun', power: 0, ticks: 1 },
    description: 'Contra-ataque em area 3x3 que atordoa os inimigos atingidos.',
  },
  {
    id: 'lk_a7', name: 'Intimidacao', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 10, range: 5,
    description: 'Intimidacao real que atordoa um inimigo.',
  },
  {
    id: 'lk_a8', name: 'Desarme', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 5, range: 5,
    description: 'Desarma o inimigo, cancelando seu proximo ataque.',
  },

  // ── defense1 (strong defense — self-sustain) ───────────────────────────────
  {
    id: 'lk_d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Desaparece nas sombras, esquivando do proximo ataque.',
  },
  {
    id: 'lk_d2', name: 'Recuperacao Real', category: 'defense', group: 'defense1',
    effectType: 'regen', targetType: 'self', power: 20,
    description: 'Regeneracao real que recupera 30% do HP ao longo de 2 turnos.',
  },
  {
    id: 'lk_d3', name: 'Sombra Real', category: 'defense', group: 'defense1',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Cria um clone sombrio que absorve o proximo ataque.',
  },
  {
    id: 'lk_d4', name: 'Espirito de Sobrevivencia', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'self', power: 35,
    description: 'Espirito de sobrevivencia que cura o rei instantaneamente.',
  },

  // ── defense2 (light defense) ───────────────────────────────────────────────
  {
    id: 'lk_d5', name: 'Escudo Self', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 25,
    description: 'Escudo pessoal do rei.',
  },
  {
    id: 'lk_d6', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 90,
    description: 'Escudo absoluto com 90% de mitigacao. O rei nao pode se mover no proximo turno.',
  },
  {
    id: 'lk_d7', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Esquiva do proximo ataque recebido.',
  },
  {
    id: 'lk_d8', name: 'Ordem Real', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 20,
    secondaryEffect: { effectType: 'def_up', power: 15, ticks: 1 },
    description: 'Ordem real que concede escudo e aumenta a defesa do rei.',
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
