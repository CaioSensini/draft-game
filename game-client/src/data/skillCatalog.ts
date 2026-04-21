/**
 * data/skillCatalog.ts — canonical skill definitions (v3 — SKILLS_CATALOG_v3_FINAL.md §6).
 *
 * Pure data. No engine imports. 128 entries = 4 classes × 16 skills × 2 sides.
 *
 * Adding a new skill:
 *   1. Append to the appropriate role array.
 *   2. Reference its id in data/deckAssignments.ts if it belongs to the default bot deck.
 *   3. No engine changes required unless the effectType is new.
 *
 * Shared-name rule (registered 2026-04-20, DECISIONS.md):
 *   Cards with the same name MUST have identical mechanics, power, and description.
 *   If two cards need different mechanics, they need different names.
 *
 * v3 caveats:
 *   - Some mechanics are represented approximately in data (e.g. conditional damage,
 *     clone summoning, untargetable) and will be refined in the EffectResolver.
 *   - Multi-tick damage (Chuva de Mana "22 dano em 2 ticks") is modeled as single power
 *     with a secondaryEffect of the same type for the second tick where possible.
 */

import type { SkillDefinition } from '../domain/Skill'

function mirror(skills: SkillDefinition[]): SkillDefinition[] {
  return skills.map((s) => ({ ...s, id: s.id.replace(/^l/, 'r') }))
}

// ══════════════════════════════════════════════════════════════════════════════
// [1] SPECIALIST — Mage / support caster
//     HP 130 · ATK 20 · DEF 10 · MOB 2
//     Passiva: Queimação (-30% cura em alvos atingidos, 2t)
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_SPECIALIST: SkillDefinition[] = [

  // ── attack1 (dano alto) ────────────────────────────────────────────────────
  {
    id: 'ls_a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 28, range: 0,
    areaShape: { type: 'square', radius: 1 }, // 2x2 campo inimigo (aprox 3x3 no grid atual)
    secondaryEffects: [{ effectType: 'burn', power: 6, ticks: 2 }],
    description: '28 dano em área 2x2 no campo inimigo. Aplica queimação 6/turno por 2 turnos.',
  },
  {
    id: 'ls_a2', name: 'Chuva de Mana', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 22, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 2 },
    description: '22 dano em 2 ticks (11+11) em linha vertical de 3 tiles no campo inimigo.',
  },
  {
    id: 'ls_a3', name: 'Raio Purificador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffects: [{ effectType: 'purge', power: 0 }],
    description: '25 dano + purge em inimigos na linha. Aliados atingidos ganham shield 10.',
  },
  {
    id: 'ls_a4', name: 'Explosão Central', category: 'attack', group: 'attack1',
    effectType: 'mark', targetType: 'single', power: 50, range: 0,
    description:
      '1º uso: marca o alvo (não-removível). 2º uso em marcado: 50 dano + 50% extra se alvo tem debuff. ' +
      'Ignora Esquiva e imunidades.',
  },

  // ── attack2 (controle) ─────────────────────────────────────────────────────
  {
    id: 'ls_a5', name: 'Orbe de Lentidão', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffects: [
      { effectType: 'def_down', power: 25, ticks: 1 },
      { effectType: 'mov_down', power: 1,  ticks: 1 },
    ],
    description: '12 dano em área 3x3. def_down 25% + mov_down 1 por 1 turno.',
  },
  {
    id: 'ls_a6', name: 'Correntes Rígidas', category: 'attack', group: 'attack2',
    effectType: 'snare', targetType: 'area', power: 10, range: 0,
    areaShape: { type: 'diamond', radius: 1 },
    description: '10 dano em formato + (5 casas). Prende inimigos por 1 turno.',
  },
  {
    id: 'ls_a7', name: 'Névoa', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 0, range: 0,
    areaShape: { type: 'square', radius: 7 },
    secondaryEffects: [{ effectType: 'def_down', power: 15, ticks: 2 }],
    description:
      'Toda arena inimiga. Aliados: def_up 15%. Inimigos: def_down 15% + cura recebida -30% por 2 turnos.',
  },
  {
    id: 'ls_a8', name: 'Congelamento', category: 'attack', group: 'attack2',
    effectType: 'stun', targetType: 'single', power: 18, range: 0,
    secondaryEffects: [{ effectType: 'def_down', power: 20, ticks: 1 }],
    description: '18 dano + stun 1t + def_down 20% por 1 turno.',
  },

  // ── defense1 (forte) ───────────────────────────────────────────────────────
  {
    id: 'ls_d1', name: 'Cura Suprema', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'single', power: 35,
    description: 'Cura 35 HP em 1 aliado (não-rei).',
  },
  {
    id: 'ls_d2', name: 'Renascimento Parcial', category: 'defense', group: 'defense1',
    effectType: 'revive', targetType: 'lowest_ally', power: 25,
    description:
      'Revive latente (2 turnos) no aliado de menor HP (não-rei). Revive com 25 HP se morrer. ' +
      'Máximo 1x por aliado por partida.',
  },
  {
    id: 'ls_d3', name: 'Campo de Cura', category: 'defense', group: 'defense1',
    effectType: 'heal', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffects: [{ effectType: 'shield', power: 10, ticks: 1 }],
    description: 'Cura 12 HP + shield 10 (1t) em área 3x3. Rei só recebe shield.',
  },
  {
    id: 'ls_d4', name: 'Proteção', category: 'defense', group: 'defense1',
    effectType: 'cleanse', targetType: 'area', power: 0, range: 0,
    areaShape: { type: 'diamond', radius: 1 },
    description:
      'Formato + (5 casas). Remove todos debuffs aliados + imunidade a novos debuffs por 1 turno.',
  },

  // ── defense2 (leve) ────────────────────────────────────────────────────────
  {
    id: 'ls_d5', name: 'Campo de Cura Contínuo', category: 'defense', group: 'defense2',
    effectType: 'regen', targetType: 'area', power: 6, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description:
      'Regen 6 HP/turno por 2 turnos em área 3x3. Rei não recebe. Cancelado se aliado tomar dano.',
  },
  {
    id: 'ls_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Evita completamente o primeiro ataque direto no próximo turno.',
  },
  {
    id: 'ls_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 60,
    description: 'Shield 60. Persiste até ser quebrado ou 2 turnos.',
  },
  {
    id: 'ls_d8', name: 'Aura de Proteção', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffects: [{ effectType: 'atk_up', power: 10, ticks: 1 }],
    description: 'Shield 12 + atk_up 10% por 1 turno em área diamante r2.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [2] WARRIOR — Tank / frontline bruiser
//     HP 200 · ATK 18 · DEF 20 · MOB 2
//     Passiva: Protetor (-15% dano em aliados adjacentes)
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_WARRIOR: SkillDefinition[] = [

  // ── attack1 (dano alto) ────────────────────────────────────────────────────
  {
    id: 'lw_a1', name: 'Colisão Titânica', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 22, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 5 },
    secondaryEffects: [{ effectType: 'push', power: 1 }],
    description: '22 dano em retângulo 6x2 vertical + push 1 sqm. Se bloqueado: snare 1t.',
  },
  {
    id: 'lw_a2', name: 'Impacto', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 28, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffects: [
      { effectType: 'def_down', power: 18, ticks: 1 },
      { effectType: 'mov_down', power: 1,  ticks: 1 },
    ],
    description: '28 dano em área 3x3. def_down 18% + mov_down 1 por 1 turno.',
  },
  {
    id: 'lw_a3', name: 'Golpe Devastador', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 30, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffects: [{ effectType: 'purge', power: 0 }],
    description: '30 dano em área 2x2. Remove buffs e quebra shields dos atingidos.',
  },
  {
    id: 'lw_a4', name: 'Investida Brutal', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 24, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 2 },
    // Push is handled per-line inside CombatEngine (central vs flanks)
    // rather than as a uniform secondary — see v3 §6.3.
    description:
      '24 dano em linha vertical 3 sqm. Linha central: push 1 + snare 1t se bloqueado. ' +
      'Linhas cima/baixo: empurradas perpendicular.',
  },

  // ── attack2 (controle) ─────────────────────────────────────────────────────
  {
    id: 'lw_a5', name: 'Provocação', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 10, range: 0,
    secondaryEffects: [
      { effectType: 'silence_defense', power: 0,  ticks: 1 },
      { effectType: 'def_down',        power: 15, ticks: 1 },
    ],
    description: '10 dano + def_down 15% + silence_defense 1t em 1 inimigo.',
  },
  {
    id: 'lw_a6', name: 'Muralha Viva', category: 'attack', group: 'attack2',
    effectType: 'summon_wall', targetType: 'area', power: 0, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 1 },
    secondaryEffects: [{ effectType: 'def_down', power: 15, ticks: 2 }],
    description:
      'Parede de 2 sqm vertical no campo inimigo dura 2t. Inimigos adjacentes: def_down 15%, mov_down 1, 3 dano/turno.',
  },
  {
    id: 'lw_a7', name: 'Investida', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    secondaryEffects: [
      { effectType: 'def_down', power: 15, ticks: 1 },
      { effectType: 'mov_down', power: 1,  ticks: 1 },
    ],
    description: '12 dano em linha vertical 3 sqm. def_down 15% + mov_down 1 por 1 turno.',
  },
  {
    id: 'lw_a8', name: 'Prisão de Muralha Morta', category: 'attack', group: 'attack2',
    effectType: 'summon_wall', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'ring', radius: 1 },
    secondaryEffects: [{ effectType: 'snare', power: 0, ticks: 2 }],
    description:
      '12 dano no centro + 8 paredes temporárias ao redor. Inimigos dentro: snare 2t. ' +
      'Paredes quebram com qualquer atk1.',
  },

  // ── defense1 (forte) ───────────────────────────────────────────────────────
  {
    id: 'lw_d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'all_allies', power: 50,
    preMovement: { maxTiles: 2 },
    description:
      'Move até 2 sqm + cria parede de escudo 3 casas à frente vertical. ' +
      'Aliados no retângulo 6 sqm atrás: -50% dano por 1 turno.',
  },
  {
    id: 'lw_d2', name: 'Guardião', category: 'defense', group: 'defense1',
    effectType: 'damage_redirect', targetType: 'single', power: 60,
    description:
      '60% do dano recebido pelo aliado é redirecionado ao guerreiro, reduzido 30% no guerreiro (1 turno).',
  },
  {
    id: 'lw_d3', name: 'Resistência Absoluta', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 65,
    secondaryEffects: [{ effectType: 'def_up', power: 25, ticks: 1 }],
    preMovement: { maxTiles: 1 },
    description: 'Guerreiro + aliado atrás: -65% dano por 1 turno. Pode mover 1 sqm antes.',
  },
  {
    id: 'lw_d8', name: 'Bater em Retirada', category: 'defense', group: 'defense1',
    effectType: 'retreat_allies', targetType: 'all_allies', power: 15,
    description:
      'Move todos aliados 1 casa pra trás em 4x4. +1 mov próximo turno + -15% dano por 1 turno.',
  },

  // ── defense2 (leve) ────────────────────────────────────────────────────────
  {
    id: 'lw_d4', name: 'Fortaleza Inabalável', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 0,
    secondaryEffects: [{ effectType: 'stun', power: 0, ticks: 1 }],
    description: '-80% dano recebido por 1 turno. Não pode mover no próximo turno de movimento.',
  },
  {
    id: 'lw_d5', name: 'Escudo de Grupo', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'all_allies', power: 15,
    description: 'Shield 15 em todos aliados por 2 turnos.',
  },
  {
    id: 'lw_d6', name: 'Postura Defensiva', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: 'Aliados em 3x3 ao redor: -25% dano por 1 turno.',
  },
  {
    id: 'lw_d7', name: 'Avançar', category: 'defense', group: 'defense2',
    effectType: 'advance_allies', targetType: 'all_allies', power: 10,
    secondaryEffects: [{ effectType: 'atk_up', power: 10, ticks: 1 }],
    description:
      'Move aliados em 4x4 1 casa à frente. +1 mov + -10% dano + +10% ATK por 1 turno.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [3] EXECUTOR — Assassin / DPS
//     HP 120 · ATK 24 · DEF 8 · MOB 3
//     Passiva: Isolado (+20% dmg / +10% dmg recebido sem aliados adjacentes)
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_EXECUTOR: SkillDefinition[] = [

  // ── attack1 (dano alto) ────────────────────────────────────────────────────
  {
    id: 'le_a1', name: 'Corte Mortal', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'single', power: 45, range: 0,
    secondaryEffects: [{ effectType: 'cleanse', power: 0 }],
    description:
      '45 dano + remove debuffs do alvo. Se alvo tinha bleed: +50% dano (67 total).',
  },
  {
    id: 'le_a2', name: 'Tempestade de Lâminas', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 26, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: '26 dano em área 3x3. Se alvos tinham bleed: +50% dano neles.',
  },
  {
    id: 'le_a3', name: 'Disparo Preciso', category: 'attack', group: 'attack1',
    effectType: 'true_damage', targetType: 'single', power: 30, range: 0,
    description:
      '30 true damage (ignora DEF). Se alvo tinha bleed: ignora também shields.',
  },
  {
    id: 'le_a4', name: 'Corte Preciso', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area', power: 22, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 1 },
    secondaryEffects: [{ effectType: 'purge', power: 0 }],
    description: '22 dano em 2 sqm horizontal + purge.',
  },

  // ── attack2 (bleeds) ───────────────────────────────────────────────────────
  {
    id: 'le_a5', name: 'Corte Hemorragia', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 8, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 1 },
    secondaryEffects: [{ effectType: 'bleed', power: 4, ticks: 3 }],
    description: '8 dano + bleed 4/turno por 3t em 2 sqm horizontal. Acumulativo se re-aplicado.',
  },
  {
    id: 'le_a6', name: 'Bomba de Espinhos', category: 'attack', group: 'attack2',
    effectType: 'bleed', targetType: 'area', power: 10, range: 0,
    areaShape: { type: 'diamond', radius: 2 },
    secondaryEffects: [{ effectType: 'bleed', power: 5, ticks: 2 }],
    description: '10 dano + bleed 5/turno por 2t em diamante r2.',
  },
  {
    id: 'le_a7', name: 'Marca da Morte', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 3 },
    secondaryEffects: [{ effectType: 'bleed', power: 8, ticks: 2 }],
    description:
      '12 dano em 8 sqm vertical (4 de baixo, 2 grossura). Remove shields (cura 20% deles como HP). ' +
      'Bleed 8/turno por 2t.',
  },
  {
    id: 'le_a8', name: 'Armadilha Oculta', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 15, range: 0,
    secondaryEffects: [{ effectType: 'bleed', power: 4, ticks: 3 }],
    description:
      'Arma tile (não em casa ocupada). Ao pisar: 15 dano + snare 1t + bleed 4/turno por 3t.',
  },

  // ── defense1 (self-buffs) ──────────────────────────────────────────────────
  {
    id: 'le_d1', name: 'Refletir', category: 'defense', group: 'defense1',
    effectType: 'reflect', targetType: 'self', power: 25,
    description: '-25% dano recebido + reflete o mitigado ao atacante no próximo turno.',
  },
  {
    id: 'le_d2', name: 'Adrenalina', category: 'defense', group: 'defense1',
    effectType: 'atk_up', targetType: 'self', power: 25,
    description:
      '+25% ATK por 2 turnos. Ao final: perde 15% HP máximo (bloqueável por shield).',
  },
  {
    id: 'le_d3', name: 'Ataque em Dobro', category: 'defense', group: 'defense1',
    effectType: 'double_attack', targetType: 'self', power: 0,
    cooldownTurns: 2,
    description:
      'Próximo turno: 2 skills atk, 0 def. Cooldown: 2 turnos (não usável consecutivamente).',
  },
  {
    id: 'le_d4', name: 'Teleport', category: 'defense', group: 'defense1',
    effectType: 'teleport_self', targetType: 'self', power: 5,
    preMovement: { maxTiles: 5, ignoresObstacles: true, consumesNextMovement: true },
    description: 'Teleporta até 5 sqm. Consome próximo turno de movimento.',
  },

  // ── defense2 (leve) ────────────────────────────────────────────────────────
  {
    id: 'le_d5', name: 'Recuo Rápido', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 20,
    preMovement: { maxTiles: 2, restrictToOwnSide: true },
    description: 'Move até 2 sqm pra trás + shield 20 por 1 turno.',
  },
  {
    id: 'le_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Evita completamente o primeiro ataque direto no próximo turno.',
  },
  {
    id: 'le_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 60,
    description: 'Shield 60. Persiste até ser quebrado ou 2 turnos.',
  },
  {
    id: 'le_d8', name: 'Shield', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 25,
    description: 'Shield 25 por 1 turno.',
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// [4] KING — Leader / sustain fighter
//     HP 180 · ATK 16 · DEF 14 · MOB 4
//     Passiva: Proteção Real (-20% dano, aplica a true damage)
//     Condição de vitória: rei morto = time perde.
// ══════════════════════════════════════════════════════════════════════════════

const LEFT_KING: SkillDefinition[] = [

  // ── attack1 (sustain) ──────────────────────────────────────────────────────
  {
    id: 'lk_a1', name: 'Soco Real', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area', power: 25, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 1 },
    secondaryEffects: [{ effectType: 'shield', power: 15, ticks: 2 }],
    description: '25 dano em 2 sqm horizontal + self shield 15 por 2 turnos.',
  },
  {
    id: 'lk_a2', name: 'Chute Real', category: 'attack', group: 'attack1',
    effectType: 'damage', targetType: 'area', power: 27, range: 0,
    areaShape: { type: 'line', direction: 'north', length: 1 },
    secondaryEffects: [{ effectType: 'shield', power: 15, ticks: 2 }],
    description: '27 dano em 2 sqm vertical + self shield 15 por 2 turnos.',
  },
  {
    id: 'lk_a3', name: 'Sequência de Socos', category: 'attack', group: 'attack1',
    effectType: 'lifesteal', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description:
      '15 dano em 3x2 + lifesteal 30%. Exceção à regra de imunidade do rei (self-heal da própria skill).',
  },
  {
    id: 'lk_a4', name: 'Domínio Real', category: 'attack', group: 'attack1',
    effectType: 'area', targetType: 'area', power: 18, range: 0,
    areaShape: { type: 'square', radius: 1 },
    description: '18 dano em 3x3 + self shield = 25% do dano total causado por 1 turno.',
  },

  // ── attack2 (controle) ─────────────────────────────────────────────────────
  {
    id: 'lk_a5', name: 'Empurrão Real', category: 'attack', group: 'attack2',
    effectType: 'push', targetType: 'area', power: 12, range: 0,
    areaShape: { type: 'line', direction: 'east', length: 6 },
    description: '12 dano em linha vertical 3 sqm até fim do mapa + push até 3 sqm.',
  },
  {
    id: 'lk_a6', name: 'Contra-ataque', category: 'attack', group: 'attack2',
    effectType: 'area', targetType: 'area', power: 15, range: 0,
    areaShape: { type: 'square', radius: 1 },
    secondaryEffects: [{ effectType: 'push', power: 1 }],
    description: '15 dano em 3x3 + push 1 sqm afastando do centro. Centro não move.',
  },
  {
    id: 'lk_a7', name: 'Intimidação', category: 'attack', group: 'attack2',
    effectType: 'damage', targetType: 'single', power: 10, range: 0,
    secondaryEffects: [{ effectType: 'teleport_target', power: 0 }],
    description:
      '10 dano + teleporta alvo e adjacentes pra local escolhido. Não pode colocar em bordas.',
  },
  {
    id: 'lk_a8', name: 'Desarme', category: 'attack', group: 'attack2',
    effectType: 'silence_attack', targetType: 'single', power: 6, range: 0,
    description:
      '6 dano + cancela skill atk do alvo no turno + silence_attack 1t. Não afeta reis.',
  },

  // ── defense1 (self-sustain) ────────────────────────────────────────────────
  {
    id: 'lk_d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1',
    effectType: 'invisibility', targetType: 'self', power: 0,
    description:
      'Teleporta qualquer lugar da metade aliada. Rei fica untargetable por skills single-target ' +
      'até receber dano ou mover.',
  },
  {
    id: 'lk_d2', name: 'Recuperação Real', category: 'defense', group: 'defense1',
    effectType: 'regen', targetType: 'self', power: 0,
    description:
      'Recupera 20% HP max em 2 turnos (10% agora, 10% próximo turno se não tomar dano). ' +
      'Exceção à imunidade de cura do rei.',
  },
  {
    id: 'lk_d3', name: 'Sombra Real', category: 'defense', group: 'defense1',
    effectType: 'clone', targetType: 'self', power: 2,
    description:
      'Cria 2 clones em células vazias. Rei pode trocar de posição com um. Clones duram 2 turnos. ' +
      'Inimigos não sabem qual é real.',
  },
  {
    id: 'lk_d4', name: 'Espírito de Sobrevivência', category: 'defense', group: 'defense1',
    effectType: 'shield', targetType: 'self', power: 10,
    description:
      'Se HP ≤ 50%: +15% HP max + shield 10% HP max por 1 turno. Se HP > 50%: +10% HP max.',
  },

  // ── defense2 (leve) ────────────────────────────────────────────────────────
  {
    id: 'lk_d5', name: 'Escudo Self', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 30,
    description: 'Shield 30 por 2 turnos.',
  },
  {
    id: 'lk_d6', name: 'Fortaleza Inabalável', category: 'defense', group: 'defense2',
    effectType: 'shield', targetType: 'self', power: 0,
    secondaryEffects: [{ effectType: 'stun', power: 0, ticks: 1 }],
    description: '-80% dano recebido por 1 turno. Não pode mover no próximo turno de movimento.',
  },
  {
    id: 'lk_d7', name: 'Esquiva', category: 'defense', group: 'defense2',
    effectType: 'evade', targetType: 'self', power: 0,
    description: 'Evita completamente o primeiro ataque direto no próximo turno.',
  },
  {
    id: 'lk_d8', name: 'Ordem Real', category: 'defense', group: 'defense2',
    effectType: 'teleport_target', targetType: 'all_allies', power: 0,
    secondaryEffects: [{ effectType: 'def_up', power: 15, ticks: 1 }],
    description:
      'Rei volta pra posição inicial, aliados teleportados pra posições adjacentes. ' +
      'Aliados adjacentes: -15% dano. Rei: -15% por aliado adjacente (máx -45%) por 1 turno.',
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
