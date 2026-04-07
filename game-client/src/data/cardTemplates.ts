import type { CardData, UnitRole } from '../types'

/**
 * 16 cards per role (64 total), organized in 4 groups of 4:
 *   attack1  — high damage attacks
 *   attack2  — control attacks (stun, bleed, area debuffs)
 *   defense1 — strong defensive abilities (evade, heavy shield)
 *   defense2 — light defensive / utility (heal, regen, small shield)
 *
 * Deck building rule: pick exactly 2 cards from each group → 8 cards per unit.
 * In battle, the player holds only 2 attack + 2 defense at a time (first in queue).
 * After use, the card rotates to the back of its queue.
 */
const roleCards: Record<UnitRole, CardData[]> = {
  // ─── REI ──────────────────────────────────────────────────────────────────
  king: [
    // attack1 — dano sustentado
    {
      id: 'king-a1', name: 'Soco Real', category: 'attack', group: 'attack1',
      shortDescription: 'Dano direto em 1 inimigo. Poder escalado com ATK.',
      power: 22, effect: 'damage', targetType: 'single',
    },
    {
      id: 'king-a1b', name: 'Chute Real', category: 'attack', group: 'attack1',
      shortDescription: 'Golpe forte em 1 inimigo. Dano maior que o Soco Real.',
      power: 26, effect: 'damage', targetType: 'single',
    },
    {
      id: 'king-a1c', name: 'Sequência de Socos', category: 'attack', group: 'attack1',
      shortDescription: 'Golpes rápidos em todos os inimigos numa área 2×2. Dano menor por alvo.',
      power: 14, effect: 'area', targetType: 'area',
    },
    {
      id: 'king-a1d', name: 'Domínio Real', category: 'attack', group: 'attack1',
      shortDescription: 'Pulso de força em área 2×2 escolhida. Dano médio, cobre bastante espaço.',
      power: 17, effect: 'area', targetType: 'area',
    },
    // attack2 — controle
    {
      id: 'king-a2', name: 'Empurrão Real', category: 'attack', group: 'attack2',
      shortDescription: 'Atordoa 1 inimigo por 1 turno, impedindo que ele aja. Dano leve.',
      power: 10, effect: 'stun', targetType: 'single',
    },
    {
      id: 'king-a2b', name: 'Contra-Ataque', category: 'attack', group: 'attack2',
      shortDescription: 'Golpe que também aplica stun. Versão mais forte que o Empurrão.',
      power: 12, effect: 'stun', targetType: 'single',
    },
    {
      id: 'king-a2c', name: 'Intimidação', category: 'attack', group: 'attack2',
      shortDescription: 'Pulso de medo em área: atordoa todos os inimigos dentro do raio.',
      power: 0, effect: 'stun', targetType: 'area',
    },
    {
      id: 'king-a2d', name: 'Desarme', category: 'attack', group: 'attack2',
      shortDescription: 'Anula completamente a ação de ataque do alvo no próximo turno.',
      power: 0, effect: 'stun', targetType: 'single',
    },
    // defense1 — forte
    {
      id: 'king-d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1',
      shortDescription: 'Esquiva total: nega completamente o próximo ataque recebido.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'king-d1b', name: 'Esquiva Real', category: 'defense', group: 'defense1',
      shortDescription: 'Idem à Fuga Sombria. Use para ter duas esquivas no deck.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'king-d1c', name: 'Sombra Real', category: 'defense', group: 'defense1',
      shortDescription: 'Cria uma ilusão: o próximo dano é ignorado completamente.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'king-d1d', name: 'Escudo Refletor', category: 'defense', group: 'defense1',
      shortDescription: 'Reflete 15 de dano de volta ao atacante no turno em que for usado.',
      power: 15, effect: 'reflect', targetType: 'self',
    },
    // defense2 — leve
    {
      id: 'king-d2', name: 'Recuperação Real', category: 'defense', group: 'defense2',
      shortDescription: 'Regenera 12 HP por turno durante 2 turnos (total: 24 HP recuperados).',
      power: 12, effect: 'regen', targetType: 'self',
    },
    {
      id: 'king-d2b', name: 'Escudo Pessoal', category: 'defense', group: 'defense2',
      shortDescription: 'Cria um escudo de 25 pontos que absorve dano antes do HP.',
      power: 25, effect: 'shield', targetType: 'self',
    },
    {
      id: 'king-d2c', name: 'Fortaleza Inabalável', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo de 18 pontos. Bom para acumular dois escudos seguidos.',
      power: 18, effect: 'shield', targetType: 'self',
    },
    {
      id: 'king-d2d', name: 'Espírito Real', category: 'defense', group: 'defense2',
      shortDescription: 'Cura imediata de 18 HP. Simples e confiável.',
      power: 18, effect: 'heal', targetType: 'self',
    },
  ],

  // ─── GUERREIRO ────────────────────────────────────────────────────────────
  warrior: [
    // attack1 — dano forte
    {
      id: 'warrior-a1', name: 'Quebra-Guarda', category: 'attack', group: 'attack1',
      shortDescription: 'Golpe pesado em 1 inimigo. Um dos maiores danos do Guerreiro.',
      power: 24, effect: 'damage', targetType: 'single',
    },
    {
      id: 'warrior-a1b', name: 'Golpe Devastador', category: 'attack', group: 'attack1',
      shortDescription: 'Maior dano single do Guerreiro. Reservado para momentos decisivos.',
      power: 30, effect: 'damage', targetType: 'single',
    },
    {
      id: 'warrior-a1c', name: 'Colisão Titânica', category: 'attack', group: 'attack1',
      shortDescription: 'Terremoto em área 2×2. Dano moderado em todos os inimigos na região.',
      power: 18, effect: 'area', targetType: 'area',
    },
    {
      id: 'warrior-a1d', name: 'Investida Brutal', category: 'attack', group: 'attack1',
      shortDescription: 'Avanço em linha: dano em todos os inimigos na área escolhida.',
      power: 20, effect: 'area', targetType: 'area',
    },
    // attack2 — controle
    {
      id: 'warrior-a2', name: 'Impacto Brutal', category: 'attack', group: 'attack2',
      shortDescription: 'Pancada que atordoa o alvo por 1 turno. Dano leve.',
      power: 14, effect: 'stun', targetType: 'single',
    },
    {
      id: 'warrior-a2b', name: 'Provocação', category: 'attack', group: 'attack2',
      shortDescription: 'Força o alvo a perder o turno de ação com dano moderado.',
      power: 12, effect: 'stun', targetType: 'single',
    },
    {
      id: 'warrior-a2c', name: 'Pisão', category: 'attack', group: 'attack2',
      shortDescription: 'Tremor em área: atordoa todos os inimigos dentro da região escolhida.',
      power: 10, effect: 'stun', targetType: 'area',
    },
    {
      id: 'warrior-a2d', name: 'Muralha Morta', category: 'attack', group: 'attack2',
      shortDescription: 'Cria zona de aprisionamento: inimigos na área ficam stunados.',
      power: 0, effect: 'stun', targetType: 'area',
    },
    // defense1 — forte
    {
      id: 'warrior-d1', name: 'Postura Defensiva', category: 'defense', group: 'defense1',
      shortDescription: 'Escudo pesado de 30 pontos apenas para o Guerreiro.',
      power: 30, effect: 'shield', targetType: 'self',
    },
    {
      id: 'warrior-d1b', name: 'Resistência Absoluta', category: 'defense', group: 'defense1',
      shortDescription: 'Escudo de 25 pontos. Segunda opção de proteção pessoal forte.',
      power: 25, effect: 'shield', targetType: 'self',
    },
    {
      id: 'warrior-d1c', name: 'Escudo do Protetor', category: 'defense', group: 'defense1',
      shortDescription: 'Aplica 18 pontos de escudo em TODOS os aliados vivos ao mesmo tempo.',
      power: 18, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'warrior-d1d', name: 'Guardião', category: 'defense', group: 'defense1',
      shortDescription: 'Esquiva total: nega o próximo dano recebido completamente.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    // defense2 — leve
    {
      id: 'warrior-d2', name: 'Proteção de Linha', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo leve de 12 pontos distribuído para todos os aliados.',
      power: 12, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'warrior-d2b', name: 'Escudo de Grupo', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo de 15 pontos para todos os aliados. Mais forte que Proteção de Linha.',
      power: 15, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'warrior-d2c', name: 'Postura Ofensiva', category: 'defense', group: 'defense2',
      shortDescription: 'Reflete 18 pontos de dano de volta ao próximo atacante.',
      power: 18, effect: 'reflect', targetType: 'self',
    },
    {
      id: 'warrior-d2d', name: 'Resistência Passiva', category: 'defense', group: 'defense2',
      shortDescription: 'Regenera 10 HP por turno por 2 turnos (total: 20 HP recuperados).',
      power: 10, effect: 'regen', targetType: 'self',
    },
  ],

  // ─── ESPECIALISTA ─────────────────────────────────────────────────────────
  specialist: [
    // attack1 — dano forte
    {
      id: 'specialist-a1', name: 'Zona Corrosiva', category: 'attack', group: 'attack1',
      shortDescription: 'Área 2×2 de ácido: causa dano a todos os inimigos na região escolhida.',
      power: 18, effect: 'area', targetType: 'area',
    },
    {
      id: 'specialist-a1b', name: 'Bola de Fogo', category: 'attack', group: 'attack1',
      shortDescription: 'Explosão em área 2×2 com dano maior. Ótima para grupos inimigos.',
      power: 22, effect: 'area', targetType: 'area',
    },
    {
      id: 'specialist-a1c', name: 'Raio Purificador', category: 'attack', group: 'attack1',
      shortDescription: 'Raio em 1 inimigo específico. Dano alto e preciso.',
      power: 25, effect: 'damage', targetType: 'single',
    },
    {
      id: 'specialist-a1d', name: 'Explosão Central', category: 'attack', group: 'attack1',
      shortDescription: 'Concentração máxima de energia: maior dano single do Especialista.',
      power: 32, effect: 'damage', targetType: 'single',
    },
    // attack2 — controle
    {
      id: 'specialist-a2', name: 'Pulso Neural', category: 'attack', group: 'attack2',
      shortDescription: 'Dano médio + atordoa o alvo por 1 turno. Ótimo combo controle+dano.',
      power: 15, effect: 'stun', targetType: 'single',
    },
    {
      id: 'specialist-a2b', name: 'Correntes Rígidas', category: 'attack', group: 'attack2',
      shortDescription: 'Atordoa todos os inimigos em forma de cruz (+) ao redor do tile escolhido.',
      power: 0, effect: 'stun', targetType: 'area',
    },
    {
      id: 'specialist-a2c', name: 'Orbe de Lentidão', category: 'attack', group: 'attack2',
      shortDescription: 'Aplica sangramento (dano por turno) em todos os inimigos da área escolhida.',
      power: 10, effect: 'bleed', targetType: 'area',
    },
    {
      id: 'specialist-a2d', name: 'Congelamento', category: 'attack', group: 'attack2',
      shortDescription: 'Dano leve + stun em 1 alvo. Versão single mais acessível do Pulso Neural.',
      power: 10, effect: 'stun', targetType: 'single',
    },
    // defense1 — forte (cura)
    {
      id: 'specialist-d1', name: 'Cura Cirúrgica', category: 'defense', group: 'defense1',
      shortDescription: 'Cura forte de 26 HP automaticamente no aliado com menos vida.',
      power: 26, effect: 'heal', targetType: 'lowest_ally',
    },
    {
      id: 'specialist-d1b', name: 'Cura Suprema', category: 'defense', group: 'defense1',
      shortDescription: 'Maior cura do jogo: 35 HP no aliado mais fraco. Reservada para emergências.',
      power: 35, effect: 'heal', targetType: 'lowest_ally',
    },
    {
      id: 'specialist-d1c', name: 'Campo de Cura', category: 'defense', group: 'defense1',
      shortDescription: 'Cura em área: restaura 20 HP para TODOS os aliados vivos.',
      power: 20, effect: 'heal', targetType: 'all_allies',
    },
    {
      id: 'specialist-d1d', name: 'Renascimento', category: 'defense', group: 'defense1',
      shortDescription: 'Regeneração: o aliado com menos vida recupera 15 HP por 2 turnos.',
      power: 15, effect: 'regen', targetType: 'lowest_ally',
    },
    // defense2 — leve
    {
      id: 'specialist-d2', name: 'Suporte Tático', category: 'defense', group: 'defense2',
      shortDescription: 'Cura leve de 12 HP para todos os aliados. Barata e confiável.',
      power: 12, effect: 'heal', targetType: 'all_allies',
    },
    {
      id: 'specialist-d2b', name: 'Fluxo Vital', category: 'defense', group: 'defense2',
      shortDescription: 'Cura de 14 HP no aliado com menos vida. Versão leve da Cura Cirúrgica.',
      power: 14, effect: 'heal', targetType: 'lowest_ally',
    },
    {
      id: 'specialist-d2c', name: 'Aura de Proteção', category: 'defense', group: 'defense2',
      shortDescription: 'Escudo de 15 pontos aplicado em todos os aliados ao mesmo tempo.',
      power: 15, effect: 'shield', targetType: 'all_allies',
    },
    {
      id: 'specialist-d2d', name: 'Benção de Cura', category: 'defense', group: 'defense2',
      shortDescription: 'Regeneração pessoal: o Especialista recupera 10 HP por 2 turnos.',
      power: 10, effect: 'regen', targetType: 'self',
    },
  ],

  // ─── EXECUTOR ─────────────────────────────────────────────────────────────
  executor: [
    // attack1 — dano alto
    {
      id: 'executor-a1', name: 'Execução Precisa', category: 'attack', group: 'attack1',
      shortDescription: 'Ataque de alto dano em 1 inimigo. Principal fonte de dano do Executor.',
      power: 30, effect: 'damage', targetType: 'single',
    },
    {
      id: 'executor-a1b', name: 'Corte Mortal', category: 'attack', group: 'attack1',
      shortDescription: 'Golpe letal: maior dano single do Executor. Use no alvo mais fraco.',
      power: 35, effect: 'damage', targetType: 'single',
    },
    {
      id: 'executor-a1c', name: 'Disparo Preciso', category: 'attack', group: 'attack1',
      shortDescription: 'Projétil certeiro em 1 alvo. Dano sólido, ótimo para alvos distantes.',
      power: 28, effect: 'damage', targetType: 'single',
    },
    {
      id: 'executor-a1d', name: 'Tempestade de Lâminas', category: 'attack', group: 'attack1',
      shortDescription: 'Rajada de lâminas em área 2×2. Dano menor por alvo, mas atinge múltiplos.',
      power: 20, effect: 'area', targetType: 'area',
    },
    // attack2 — controle/debuff
    {
      id: 'executor-a2', name: 'Lâmina Serrilhada', category: 'attack', group: 'attack2',
      shortDescription: 'Dano imediato + aplica sangramento: o alvo perde HP no fim de cada turno.',
      power: 18, effect: 'bleed', targetType: 'single',
    },
    {
      id: 'executor-a2b', name: 'Sangramento', category: 'attack', group: 'attack2',
      shortDescription: 'Dano leve + sangramento acumulativo. Quanto mais aplicar, mais dói.',
      power: 12, effect: 'bleed', targetType: 'single',
    },
    {
      id: 'executor-a2c', name: 'Armadilha Oculta', category: 'attack', group: 'attack2',
      shortDescription: 'Dano + atordoamento em 1 alvo. Surpreende e paralisa o inimigo.',
      power: 22, effect: 'stun', targetType: 'single',
    },
    {
      id: 'executor-a2d', name: 'Marca da Morte', category: 'attack', group: 'attack2',
      shortDescription: 'Aplica sangramento em área 2×2: todos os inimigos na região sangram.',
      power: 15, effect: 'bleed', targetType: 'area',
    },
    // defense1 — evasão forte
    {
      id: 'executor-d1', name: 'Passo Fantasma', category: 'defense', group: 'defense1',
      shortDescription: 'Esquiva total: nega completamente o próximo ataque recebido.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'executor-d1b', name: 'Esquiva', category: 'defense', group: 'defense1',
      shortDescription: 'Segunda esquiva total. Use para ter duas evasões no deck.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'executor-d1c', name: 'Bloqueio Total', category: 'defense', group: 'defense1',
      shortDescription: 'Terceira opção de esquiva. Garante que o próximo ataque não cause dano.',
      power: 0, effect: 'evade', targetType: 'self',
    },
    {
      id: 'executor-d1d', name: 'Adrenalina', category: 'defense', group: 'defense1',
      shortDescription: 'Reflexo combativo: reflete 20 pontos de dano ao próximo atacante.',
      power: 20, effect: 'reflect', targetType: 'self',
    },
    // defense2 — leve
    {
      id: 'executor-d2', name: 'Retaliação', category: 'defense', group: 'defense2',
      shortDescription: 'Reflexo passivo: reflete 12 de dano ao próximo inimigo que atacar.',
      power: 12, effect: 'reflect', targetType: 'self',
    },
    {
      id: 'executor-d2b', name: 'Refletir', category: 'defense', group: 'defense2',
      shortDescription: 'Reflete 15 de dano. Versão intermediária entre Retaliação e Adrenalina.',
      power: 15, effect: 'reflect', targetType: 'self',
    },
    {
      id: 'executor-d2c', name: 'Shield Rápido', category: 'defense', group: 'defense2',
      shortDescription: 'Cria um escudo de 20 pontos imediatamente. Simples e eficaz.',
      power: 20, effect: 'shield', targetType: 'self',
    },
    {
      id: 'executor-d2d', name: 'Recuo Rápido', category: 'defense', group: 'defense2',
      shortDescription: 'Recua e ganha um escudo de 15 pontos para se proteger no turno.',
      power: 15, effect: 'shield', targetType: 'self',
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

export function getRoleCardsByGroup(role: UnitRole, group: import('../types').CardGroup): CardData[] {
  return roleCards[role].filter((card) => card.group === group)
}

/** Returns a default deck for a role: first 2 cards from each group. */
export function getDefaultDeckForRole(role: UnitRole): { attackCards: string[]; defenseCards: string[] } {
  const cards = roleCards[role]
  const pick2 = (group: import('../types').CardGroup) =>
    cards.filter((c) => c.group === group).slice(0, 2).map((c) => c.id)
  return {
    attackCards:  [...pick2('attack1'),  ...pick2('attack2')],
    defenseCards: [...pick2('defense1'), ...pick2('defense2')],
  }
}
