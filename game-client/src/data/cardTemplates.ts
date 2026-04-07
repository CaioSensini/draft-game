import type { CardData, UnitRole } from '../types'

const roleCards: Record<UnitRole, CardData[]> = {
  king: [
    { id: 'king-a1', name: 'Golpe Real', category: 'attack', group: 'attack1', shortDescription: 'Golpe direto e pequena cura própria.', power: 22, effect: 'damage', targetType: 'single' },
    { id: 'king-a2', name: 'Ordem do Trono', category: 'attack', group: 'attack2', shortDescription: 'Dano estável em alvo único.', power: 18, effect: 'damage', targetType: 'single' },
    { id: 'king-d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1', shortDescription: 'Ativa esquiva total para o próximo dano.', power: 0, effect: 'evade', targetType: 'self' },
    { id: 'king-d2', name: 'Recuperação Real', category: 'defense', group: 'defense2', shortDescription: 'Regeneração em 2 ticks.', power: 12, effect: 'regen', targetType: 'self' }
  ],
  warrior: [
    { id: 'warrior-a1', name: 'Quebra-Guarda', category: 'attack', group: 'attack1', shortDescription: 'Ataque forte em alvo único.', power: 24, effect: 'damage', targetType: 'single' },
    { id: 'warrior-a2', name: 'Impacto Brutal', category: 'attack', group: 'attack2', shortDescription: 'Dano com atordoamento curto.', power: 14, effect: 'stun', targetType: 'single' },
    { id: 'warrior-d1', name: 'Postura Defensiva', category: 'defense', group: 'defense1', shortDescription: 'Shield pesado no próprio guerreiro.', power: 20, effect: 'shield', targetType: 'self' },
    { id: 'warrior-d2', name: 'Proteção de Linha', category: 'defense', group: 'defense2', shortDescription: 'Shield leve em todo o time.', power: 10, effect: 'shield', targetType: 'all_allies' }
  ],
  specialist: [
    { id: 'specialist-a1', name: 'Zona Corrosiva', category: 'attack', group: 'attack1', shortDescription: 'Área fixa que causa dano na região escolhida.', power: 18, effect: 'area', targetType: 'area' },
    { id: 'specialist-a2', name: 'Pulso Neural', category: 'attack', group: 'attack2', shortDescription: 'Dano moderado com atordoamento.', power: 15, effect: 'stun', targetType: 'single' },
    { id: 'specialist-d1', name: 'Cura Cirúrgica', category: 'defense', group: 'defense1', shortDescription: 'Cura forte no aliado com menor vida.', power: 26, effect: 'heal', targetType: 'lowest_ally' },
    { id: 'specialist-d2', name: 'Suporte Tático', category: 'defense', group: 'defense2', shortDescription: 'Cura pequena em todo o time.', power: 10, effect: 'heal', targetType: 'all_allies' }
  ],
  executor: [
    { id: 'executor-a1', name: 'Execução Precisa', category: 'attack', group: 'attack1', shortDescription: 'Maior dano direto do protótipo.', power: 30, effect: 'damage', targetType: 'single' },
    { id: 'executor-a2', name: 'Lâmina Serrilhada', category: 'attack', group: 'attack2', shortDescription: 'Dano com sangramento por 2 ticks.', power: 18, effect: 'bleed', targetType: 'single' },
    { id: 'executor-d1', name: 'Passo Fantasma', category: 'defense', group: 'defense1', shortDescription: 'Desvia do próximo dano.', power: 0, effect: 'evade', targetType: 'self' },
    { id: 'executor-d2', name: 'Retaliação', category: 'defense', group: 'defense2', shortDescription: 'Reflete parte do próximo dano recebido.', power: 12, effect: 'reflect', targetType: 'self' }
  ]
}

export function getRoleCards(role: UnitRole) {
  return roleCards[role]
}

export function getRoleAttackCards(role: UnitRole) {
  return roleCards[role].filter((card) => card.category === 'attack')
}

export function getRoleDefenseCards(role: UnitRole) {
  return roleCards[role].filter((card) => card.category === 'defense')
}
