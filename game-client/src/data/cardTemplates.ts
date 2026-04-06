import type { CardData, UnitRole } from '../types'

const roleCards: Record<UnitRole, CardData[]> = {
  king: [
    { id: 'king-a1', name: 'Soco Real', category: 'attack', group: 'attack1', shortDescription: 'Escolhe um inimigo próximo e causa dano forte.', power: 22, effect: 'damage', range: 3, targetKind: 'enemy', targetingMode: 'unit' },
    { id: 'king-a2', name: 'Impacto Real', category: 'attack', group: 'attack2', shortDescription: 'Escolhe um bloco e acerta quem estiver nele.', power: 18, effect: 'damage', range: 4, targetKind: 'enemy', targetingMode: 'tile', areaRadius: 0 },
    { id: 'king-d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1', shortDescription: 'Esquiva totalmente do próximo ataque.', power: 0, effect: 'evade', range: 0, targetKind: 'self', targetingMode: 'none' },
    { id: 'king-d2', name: 'Recuperação Real', category: 'defense', group: 'defense2', shortDescription: 'Regenera vida por 2 ticks.', power: 12, effect: 'regen', range: 0, targetKind: 'self', targetingMode: 'none' }
  ],
  tank: [
    { id: 'tank-a1', name: 'Colisão Titánica', category: 'attack', group: 'attack1', shortDescription: 'Escolhe um inimigo e bate muito forte.', power: 24, effect: 'damage', range: 2, targetKind: 'enemy', targetingMode: 'unit' },
    { id: 'tank-a2', name: 'Provocação', category: 'attack', group: 'attack2', shortDescription: 'Escolhe um inimigo e aplica stun curto.', power: 14, effect: 'stun', range: 3, targetKind: 'enemy', targetingMode: 'unit' },
    { id: 'tank-d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1', shortDescription: 'Gainha muito shield.', power: 20, effect: 'shield', range: 0, targetKind: 'self', targetingMode: 'none' },
    { id: 'tank-d2', name: 'Escudo de Grupo', category: 'defense', group: 'defense2', shortDescription: 'Dá shield leve no time inteiro.', power: 10, effect: 'shield', range: 0, targetKind: 'ally', targetingMode: 'none' }
  ],
  healer: [
    { id: 'healer-a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1', shortDescription: 'Escolhe um bloco e explode em área.', power: 18, effect: 'area', range: 5, targetKind: 'enemy', targetingMode: 'tile', areaRadius: 1 },
    { id: 'healer-a2', name: 'Congelamento', category: 'attack', group: 'attack2', shortDescription: 'Escolhe um bloco e stuna quem estiver nele.', power: 15, effect: 'stun', range: 5, targetKind: 'enemy', targetingMode: 'tile', areaRadius: 0 },
    { id: 'healer-d1', name: 'Cura Suprema', category: 'defense', group: 'defense1', shortDescription: 'Escolhe um aliado para curar bastante.', power: 26, effect: 'heal', range: 6, targetKind: 'ally', targetingMode: 'unit' },
    { id: 'healer-d2', name: 'Benção de Cura', category: 'defense', group: 'defense2', shortDescription: 'Cura pequena em todoo time.', power: 10, effect: 'heal', range: 0, targetKind: 'ally', targetingMode: 'none' }
  ],
  dps: [
    { id: 'dps-a1', name: 'Corte Mortal', category: 'attack', group: 'attack1', shortDescription: 'Escolhe um inimigo e causa o maior dano direto.', power: 30, effect: 'damage', range: 4, targetKind: 'enemy', targetingMode: 'unit' },
    { id: 'dps-a2', name: 'Sangramento', category: 'attack', group: 'attack2', shortDescription: 'Escolhe um inimigo e aplica bleed.', power: 18, effect: 'bleed', range: 4, targetKind: 'enemy', targetingMode: 'unit' },
    { id: 'dps-d1', name: 'Esquiva', category: 'defense', group: 'defense1', shortDescription: 'Desvia do próximo dano.', power: 0, effect: 'evade', range: 0, targetKind: 'self', targetingMode: 'none' },
    { id: 'dps-d2', name: 'Refletir', category: 'defense', group: 'defense2', shortDescription: 'Reflete parte do próximo dano.', power: 12, effect: 'reflect', range: 0, targetKind: 'self', targetingMode: 'none' }
  ]
}

export function getRoleCards(role: UnitRole) {
  return roleCards[role]
}
