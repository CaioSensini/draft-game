import type { CardData, CardGroup, UnitRole } from '../types'

/**
 * 16 cards per role (64 total), organized in 4 groups of 4:
 *   attack1  — primary damage / sustain attacks
 *   attack2  — control / utility attacks (stun, bleed, debuffs)
 *   defense1 — strong personal defenses (evade, heavy shield, reflect)
 *   defense2 — lighter / team utility defenses (group shield, heal, regen)
 *
 * Deck building rule: pick exactly 2 cards from each group -> 8 cards per unit.
 * In battle, the player holds 2 attack + 2 defense at a time (first in queue).
 * After use, the card rotates to the back of its queue.
 *
 * Card IDs match the left-side skill IDs in skillCatalog.ts:
 *   king: lk_a1..lk_a8, lk_d1..lk_d8
 *   warrior: lw_a1..lw_a8, lw_d1..lw_d8
 *   executor: le_a1..le_a8, le_d1..le_d8
 *   specialist: ls_a1..ls_a8, ls_d1..ls_d8
 */
const roleCards: Record<UnitRole, CardData[]> = {
  // ---- REI ----------------------------------------------------------------
  king: [
    // attack1 — dano sustentado
    {
      id: 'lk_a1', name: 'Soco Real', category: 'attack', group: 'attack1',
      shortDescription: 'Soco poderoso que causa dano e concede um pequeno escudo ao rei.',
      power: 30, effect: 'damage', targetType: 'single',
    },
    {
      id: 'lk_a2', name: 'Chute Real', category: 'attack', group: 'attack1',
      shortDescription: 'Chute forte que causa bom dano e concede escudo ao rei.',
      power: 32, effect: 'damage', targetType: 'single',
    },
    {
      id: 'lk_a3', name: 'Sequencia de Socos', category: 'attack', group: 'attack1',
      shortDescription: 'Socos rapidos em area 3x2, cura 20% do dano causado.',
      power: 18, effect: 'area', targetType: 'area',
    },
    {
      id: 'lk_a4', name: 'Dominio Real', category: 'attack', group: 'attack1',
      shortDescription: 'Chute giratorio 3x3 com dano leve e escudo para o rei.',
      power: 22, effect: 'area', targetType: 'area',
    },

    // attack2 — controle
    {
      id: 'lk_a5', name: 'Empurrao Real', category: 'attack', group: 'attack2',
      shortDescription: 'Empurra inimigos em linha reta ate o fim do mapa.',
      power: 15, effect: 'area', targetType: 'area',
    },
    {
      id: 'lk_a6', name: 'Contra-ataque', category: 'attack', group: 'attack2',
      shortDescription: 'Chute giratorio 3x3 que empurra inimigos para fora.',
      power: 20, effect: 'area', targetType: 'area',
    },
    {
      id: 'lk_a7', name: 'Intimidacao', category: 'attack', group: 'attack2',
      shortDescription: 'Teleporta um inimigo para onde o rei escolher.',
      power: 10, effect: 'stun', targetType: 'single',
    },
    {
      id: 'lk_a8', name: 'Desarme', category: 'attack', group: 'attack2',
      shortDescription: 'Cancela a skill de ataque do inimigo neste turno.',
      power: 5, effect: 'stun', targetType: 'single',
    },

    // defense1
    {
      id: 'lk_d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1',
      shortDescription: 'Fica invisivel e teleporta para qualquer lugar do mapa.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'lk_d2', name: 'Recuperacao Real', category: 'defense', group: 'defense1',
      shortDescription: 'Regenera 30% da vida maxima ao longo de 2 turnos.',
      power: 20, effect: 'regen', targetType: 'self',
    },
    {
      id: 'lk_d3', name: 'Sombra Real', category: 'defense', group: 'defense1',
      shortDescription: 'Cria 2 clones do rei. Inimigo nao sabe qual e o verdadeiro.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'lk_d4', name: 'Espirito de Sobrevivencia', category: 'defense', group: 'defense1',
      shortDescription: 'Se HP < 50%: recupera 20% HP + escudo. Se > 50%: recupera 15%.',
      power: 25, effect: 'heal', targetType: 'self',
    },

    // defense2
    {
      id: 'lk_d5', name: 'Escudo Self', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo moderado que dura 2 turnos.',
      power: 40, effect: 'shield', targetType: 'self',
    },
    {
      id: 'lk_d6', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
      shortDescription: '90% mitigacao, mas nao pode mover no proximo turno.',
      power: 100, effect: 'shield', targetType: 'self',
    },
    {
      id: 'lk_d7', name: 'Esquiva', category: 'defense', group: 'defense2',
      shortDescription: 'Imune a todas as skills no proximo turno.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'lk_d8', name: 'Ordem Real', category: 'defense', group: 'defense2',
      shortDescription: 'Reune o time ao redor do rei com 20% protecao.',
      power: 30, effect: 'shield', targetType: 'self',
    },
  ],

  // ---- GUERREIRO ----------------------------------------------------------
  warrior: [
    // attack1
    {
      id: 'lw_a1', name: 'Colisao Titanica', category: 'attack', group: 'attack1',
      shortDescription: 'Levanta o piso em retangulo 6x2, empurra inimigos para tras.',
      power: 25, effect: 'area', targetType: 'area',
    },
    {
      id: 'lw_a2', name: 'Impacto', category: 'attack', group: 'attack1',
      shortDescription: 'Bate no chao 3x3, reduz movimento e defesa dos atingidos.',
      power: 35, effect: 'area', targetType: 'area',
    },
    {
      id: 'lw_a3', name: 'Golpe Devastador', category: 'attack', group: 'attack1',
      shortDescription: 'Martelada 2x2 que quebra shields e buffs inimigos.',
      power: 45, effect: 'area', targetType: 'area',
    },
    {
      id: 'lw_a4', name: 'Investida Brutal', category: 'attack', group: 'attack1',
      shortDescription: 'Ataque em linha reta que empurra e causa snare.',
      power: 40, effect: 'area', targetType: 'area',
    },

    // attack2 — controle
    {
      id: 'lw_a5', name: 'Provocacao', category: 'attack', group: 'attack2',
      shortDescription: 'Dano leve, -20% defesa, bloqueia skill de defesa.',
      power: 18, effect: 'damage', targetType: 'single',
    },
    {
      id: 'lw_a6', name: 'Muralha Viva', category: 'attack', group: 'attack2',
      shortDescription: 'Cria parede no campo inimigo por 2 turnos.',
      power: 10, effect: 'area', targetType: 'area',
    },
    {
      id: 'lw_a7', name: 'Investida', category: 'attack', group: 'attack2',
      shortDescription: 'Ataque em linha reta, -20% defesa e -1 movimento.',
      power: 25, effect: 'area', targetType: 'area',
    },
    {
      id: 'lw_a8', name: 'Prisao de Muralha Morta', category: 'attack', group: 'attack2',
      shortDescription: 'Cria paredes ao redor do inimigo, prendendo-o.',
      power: 15, effect: 'area', targetType: 'area',
    },

    // defense1
    {
      id: 'lw_d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1',
      shortDescription: 'Avanca ate 2 casas e cria escudo protegendo 6 tiles.',
      power: 70, effect: 'shield', targetType: 'self',
    },
    {
      id: 'lw_d2', name: 'Guardiao', category: 'defense', group: 'defense1',
      shortDescription: '80% do dano no aliado e redirecionado para o guerreiro.',
      power: 50, effect: 'shield', targetType: 'lowest_ally',
    },
    {
      id: 'lw_d3', name: 'Resistencia Absoluta', category: 'defense', group: 'defense1',
      shortDescription: 'Escudo potente com 70% mitigacao para si e aliado atras.',
      power: 85, effect: 'shield', targetType: 'self',
    },
    {
      id: 'lw_d4', name: 'Fortaleza Inabalavel', category: 'defense', group: 'defense2',
      shortDescription: '90% mitigacao, mas nao pode mover no proximo turno.',
      power: 100, effect: 'shield', targetType: 'self',
    },

    // defense2
    {
      id: 'lw_d5', name: 'Escudo de Grupo', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo leve em todo o time por 2 turnos.',
      power: 20, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'lw_d6', name: 'Postura Defensiva', category: 'defense', group: 'defense2',
      shortDescription: 'Aliados na area 3x3 mitigam 30% do dano.',
      power: 25, effect: 'shield', targetType: 'area',
    },
    {
      id: 'lw_d7', name: 'Avancar', category: 'defense', group: 'defense2',
      shortDescription: 'Move aliados 1 casa para frente, +1 movimento e 10% mitigacao.',
      power: 10, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'lw_d8', name: 'Bater em Retirada', category: 'defense', group: 'defense1',
      shortDescription: 'Move aliados 1 casa para tras com 20% mitigacao.',
      power: 20, effect: 'shield', targetType: 'all_allies',
    },
  ],

  // ---- EXECUTOR -----------------------------------------------------------
  executor: [
    // attack1 — dano alto
    {
      id: 'le_a1', name: 'Corte Mortal', category: 'attack', group: 'attack1',
      shortDescription: 'Dano alto, +50% extra se alvo sangrando. Remove sangramento.',
      power: 55, effect: 'damage', targetType: 'single',
    },
    {
      id: 'le_a2', name: 'Tempestade de Laminas', category: 'attack', group: 'attack1',
      shortDescription: 'Dano em area 3x3, +50% em alvos sangrando.',
      power: 40, effect: 'area', targetType: 'area',
    },
    {
      id: 'le_a3', name: 'Disparo Preciso', category: 'attack', group: 'attack1',
      shortDescription: 'Ignora escudo se alvo sangrando, dano direto na vida.',
      power: 45, effect: 'damage', targetType: 'single',
    },
    {
      id: 'le_a4', name: 'Corte Preciso', category: 'attack', group: 'attack1',
      shortDescription: 'Remove buffs do inimigo sangrando antes de causar dano.',
      power: 35, effect: 'damage', targetType: 'single',
    },

    // attack2 — sangramento / controle
    {
      id: 'le_a5', name: 'Corte Hemorragia', category: 'attack', group: 'attack2',
      shortDescription: 'Sangramento hemorragico acumulativo permanente.',
      power: 10, effect: 'bleed', targetType: 'single',
    },
    {
      id: 'le_a6', name: 'Bomba de Espinhos', category: 'attack', group: 'attack2',
      shortDescription: 'Dano leve e sangramento forte por 2 turnos em diamante.',
      power: 18, effect: 'bleed', targetType: 'area',
    },
    {
      id: 'le_a7', name: 'Marca da Morte', category: 'attack', group: 'attack2',
      shortDescription: 'Remove shields, absorve 20% como vida, sangramento 2 turnos.',
      power: 20, effect: 'area', targetType: 'area',
    },
    {
      id: 'le_a8', name: 'Armadilha Oculta', category: 'attack', group: 'attack2',
      shortDescription: 'Armadilha invisivel: dano, snare e sangramento ao pisar.',
      power: 40, effect: 'damage', targetType: 'single',
    },

    // defense1
    {
      id: 'le_d1', name: 'Refletir', category: 'defense', group: 'defense1',
      shortDescription: 'Mitiga 25% do dano e reflete de volta ao atacante.',
      power: 25, effect: 'reflect', targetType: 'self',
    },
    {
      id: 'le_d2', name: 'Adrenalina', category: 'defense', group: 'defense1',
      shortDescription: '+50% dano por 1 turno, perde 30% HP maxima depois.',
      power: 50, effect: 'shield', targetType: 'self',
    },
    {
      id: 'le_d3', name: 'Ataque em Dobro', category: 'defense', group: 'defense1',
      shortDescription: 'Permite usar 2 skills de ataque no proximo turno (sem defesa).',
      power: 0, effect: 'shield', targetType: 'self',
    },
    {
      id: 'le_d4', name: 'Teleport', category: 'defense', group: 'defense1',
      shortDescription: 'Teleporta para qualquer lugar da sua arena.',
      power: 0, effect: 'evade', targetType: 'self',
    },

    // defense2
    {
      id: 'le_d5', name: 'Recuo Rapido', category: 'defense', group: 'defense2',
      shortDescription: 'Move 2 casas para tras com escudo pequeno.',
      power: 25, effect: 'shield', targetType: 'self',
    },
    {
      id: 'le_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
      shortDescription: 'Imune a todas as skills no proximo turno.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'le_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
      shortDescription: 'Bloqueia o proximo ataque 100%. Permanece ate usado.',
      power: 100, effect: 'shield', targetType: 'self',
    },
    {
      id: 'le_d8', name: 'Shield', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo consideravel por 1 turno.',
      power: 45, effect: 'shield', targetType: 'self',
    },
  ],

  // ---- ESPECIALISTA -------------------------------------------------------
  specialist: [
    // attack1 — dano magico
    {
      id: 'ls_a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1',
      shortDescription: 'Explosao magica 2x2 com queimacao.',
      power: 45, effect: 'area', targetType: 'area',
    },
    {
      id: 'ls_a2', name: 'Chuva de Mana', category: 'attack', group: 'attack1',
      shortDescription: 'Fragmentos magicos em linha vertical, dano em 2 ticks.',
      power: 35, effect: 'area', targetType: 'area',
    },
    {
      id: 'ls_a3', name: 'Raio Purificador', category: 'attack', group: 'attack1',
      shortDescription: 'Remove buffs dos inimigos em linha reta e causa dano.',
      power: 40, effect: 'area', targetType: 'area',
    },
    {
      id: 'ls_a4', name: 'Explosao Central', category: 'attack', group: 'attack1',
      shortDescription: 'Marca o alvo. Se ja marcado, causa dano massivo.',
      power: 55, effect: 'damage', targetType: 'single',
    },

    // attack2 — controle / debuff
    {
      id: 'ls_a5', name: 'Orbe de Lentidao', category: 'attack', group: 'attack2',
      shortDescription: 'Dano leve 3x3, reduz movimento e defesa em 40%.',
      power: 15, effect: 'area', targetType: 'area',
    },
    {
      id: 'ls_a6', name: 'Correntes Rigidas', category: 'attack', group: 'attack2',
      shortDescription: 'Snare em formato + impedindo de andar.',
      power: 12, effect: 'stun', targetType: 'area',
    },
    {
      id: 'ls_a7', name: 'Nevoa', category: 'attack', group: 'attack2',
      shortDescription: 'Cobre arena inimiga, -40% cura recebida por 2 turnos.',
      power: 5, effect: 'area', targetType: 'area',
    },
    {
      id: 'ls_a8', name: 'Congelamento', category: 'attack', group: 'attack2',
      shortDescription: 'Congela o alvo por 1 turno com -20% defesa.',
      power: 15, effect: 'stun', targetType: 'single',
    },

    // defense1 — cura forte
    {
      id: 'ls_d1', name: 'Cura Suprema', category: 'defense', group: 'defense1',
      shortDescription: 'Cura massiva em 1 aliado (nao pode no rei).',
      power: 65, effect: 'heal', targetType: 'lowest_ally',
    },
    {
      id: 'ls_d2', name: 'Renascimento Parcial', category: 'defense', group: 'defense1',
      shortDescription: 'Revive se tomar golpe fatal. Inimigo nao ve.',
      power: 40, effect: 'shield', targetType: 'lowest_ally',
    },
    {
      id: 'ls_d3', name: 'Campo de Cura', category: 'defense', group: 'defense1',
      shortDescription: 'Cura leve + escudo leve em area 3x3.',
      power: 20, effect: 'heal', targetType: 'area',
    },
    {
      id: 'ls_d4', name: 'Protecao', category: 'defense', group: 'defense1',
      shortDescription: 'Remove debuffs e concede imunidade por 1 turno.',
      power: 0, effect: 'heal', targetType: 'area',
    },

    // defense2 — utilidade leve
    {
      id: 'ls_d5', name: 'Campo de Cura Continuo', category: 'defense', group: 'defense2',
      shortDescription: 'Cura leve agora e no proximo turno. Nao cura rei.',
      power: 12, effect: 'regen', targetType: 'area',
    },
    {
      id: 'ls_d6', name: 'Esquiva', category: 'defense', group: 'defense2',
      shortDescription: 'Imune a todas as skills no proximo turno.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'ls_d7', name: 'Bloqueio Total', category: 'defense', group: 'defense2',
      shortDescription: 'Bloqueia proximo ataque 100%. Permanece ate usado.',
      power: 100, effect: 'shield', targetType: 'self',
    },
    {
      id: 'ls_d8', name: 'Aura de Protecao', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo + 20% dano extra em diamante.',
      power: 15, effect: 'shield', targetType: 'area',
    },
  ],
}

export function getRoleCards(role: UnitRole): CardData[] {
  return roleCards[role]
}

export function getRoleAttackCards(role: UnitRole): CardData[] {
  return roleCards[role].filter((card) => card.category === 'attack')
}

export function getRoleDefenseCards(role: UnitRole): CardData[] {
  return roleCards[role].filter((card) => card.category === 'defense')
}

export function getRoleCardsByGroup(role: UnitRole, group: CardGroup): CardData[] {
  return roleCards[role].filter((card) => card.group === group)
}

/** Returns a default deck for a role: first 2 cards from each group. */
export function getDefaultDeckForRole(role: UnitRole): { attackCards: string[]; defenseCards: string[] } {
  const cards = roleCards[role]
  const pick2 = (group: CardGroup) =>
    cards.filter((c) => c.group === group).slice(0, 2).map((c) => c.id)
  return {
    attackCards:  [...pick2('attack1'),  ...pick2('attack2')],
    defenseCards: [...pick2('defense1'), ...pick2('defense2')],
  }
}
