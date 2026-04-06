import type { CardData, UnitRole } from '../types'

const roleCards: Record<UnitRole, CardData[]> = {
  king: [
    { id: 'king-a1', name: 'Soco Real', category: 'attack', group: 'attack1', shortDescription: 'Golpe direto e cura leve no rei.', power: 22, effect: 'damage' },
    { id: 'king-a2', name: 'Empurrão Real', category: 'attack', group: 'attack2', shortDescription: 'Dano leve com pressão de frente.', power: 18, effect: 'damage' },
    { id: 'king-d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1', shortDescription: 'Ativa esquiva total para o próximo ataque.', power: 0, effect: 'evade' },
    { id: 'king-d2', name: 'Recuperação Real', category: 'defense', group: 'defense2', shortDescription: 'Regeneração em 2 ticks.', power: 12, effect: 'regen' }
  ],
  tank: [
    { id: 'tank-a1', name: 'Colisão Titânica', category: 'attack', group: 'attack1', shortDescription: 'Dano forte em alvo único.', power: 24, effect: 'damage' },
    { id: 'tank-a2', name: 'Provocação', category: 'attack', group: 'attack2', shortDescription: 'Dano com atordoamento curto.', power: 14, effect: 'stun' },
    { id: 'tank-d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1', shortDescription: 'Shield pesado no tank.', power: 20, effect: 'shield' },
    { id: 'tank-d2', name: 'Escudo de Grupo', category: 'defense', group: 'defense2', shortDescription: 'Shield leve em todo o time.', power: 10, effect: 'shield' }
  ],
  healer: [
    { id: 'healer-a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1', shortDescription: 'Explosão que atinge alvo e adjacentes.', power: 18, effect: 'area' },
    { id: 'healer-a2', name: 'Congelamento', category: 'attack', group: 'attack2', shortDescription: 'Dano moderado e atordoamento.', power: 15, effect: 'stun' },
    { id: 'healer-d1', name: 'Cura Suprema', category: 'defense', group: 'defense1', shortDescription: 'Cura forte no aliado com menor vida.', power: 26, effect: 'heal' },
    { id: 'healer-d2', name: 'Benção de Velocidade', category: 'defense', group: 'defense2', shortDescription: 'Cura pequena em todo o time.', power: 10, effect: 'heal' }
  ],
  dps: [
    { id: 'dps-a1', name: 'Corte Mortal', category: 'attack', group: 'attack1', shortDescription: 'Maior dano direto do protótipo.', power: 30, effect: 'damage' },
    { id: 'dps-a2', name: 'Sangramento', category: 'attack', group: 'attack2', shortDescription: 'Dano e sangramento por 2 ticks.', power: 18, effect: 'bleed' },
    { id: 'dps-d1', name: 'Esquiva', category: 'defense', group: 'defense1', shortDescription: 'Desvia do próximo dano.', power: 0, effect: 'evade' },
    { id: 'dps-d2', name: 'Refletir', category: 'defense', group: 'defense2', shortDescription: 'Reflete parte do próximo dano recebido.', power: 12, effect: 'reflect' }
  ]
}

export function getRoleCards(role: UnitRole) {
  return roleCards[role]
}
