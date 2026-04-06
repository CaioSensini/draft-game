import type { CardData, UnitRole } from '../types'

const roleCards: Record<UnitRole, CardData[]> = {
  king: [
    { id: 'king-a1', name: 'Soco Real', category: 'attack', group: 'attack1', shortDescription: 'Dano direto e sustain leve.' },
    { id: 'king-a2', name: 'Empurrão Real', category: 'attack', group: 'attack2', shortDescription: 'Empurra inimigos na linha.' },
    { id: 'king-d1', name: 'Fuga Sombria', category: 'defense', group: 'defense1', shortDescription: 'Reposiciona e oculta o rei.' },
    { id: 'king-d2', name: 'Recuperação Real', category: 'defense', group: 'defense2', shortDescription: 'Recupera vida ao longo de 2 turnos.' }
  ],
  tank: [
    { id: 'tank-a1', name: 'Colisão Titânica', category: 'attack', group: 'attack1', shortDescription: 'Dano em linha com empurrão.' },
    { id: 'tank-a2', name: 'Provocação', category: 'attack', group: 'attack2', shortDescription: 'Controle e redução defensiva.' },
    { id: 'tank-d1', name: 'Escudo do Protetor', category: 'defense', group: 'defense1', shortDescription: 'Bloqueio frontal pesado.' },
    { id: 'tank-d2', name: 'Escudo de Grupo', category: 'defense', group: 'defense2', shortDescription: 'Shield leve em área.' }
  ],
  healer: [
    { id: 'healer-a1', name: 'Bola de Fogo', category: 'attack', group: 'attack1', shortDescription: 'Dano forte em área.' },
    { id: 'healer-a2', name: 'Congelamento', category: 'attack', group: 'attack2', shortDescription: 'Controle e debuff defensivo.' },
    { id: 'healer-d1', name: 'Cura Suprema', category: 'defense', group: 'defense1', shortDescription: 'Cura massiva em aliado.' },
    { id: 'healer-d2', name: 'Benção de Velocidade', category: 'defense', group: 'defense2', shortDescription: 'Buff de mobilidade e defesa.' }
  ],
  dps: [
    { id: 'dps-a1', name: 'Corte Mortal', category: 'attack', group: 'attack1', shortDescription: 'Explode alvo com dano extra.' },
    { id: 'dps-a2', name: 'Sangramento', category: 'attack', group: 'attack2', shortDescription: 'Aplica dano contínuo.' },
    { id: 'dps-d1', name: 'Esquiva', category: 'defense', group: 'defense1', shortDescription: 'Imunidade curta ao próximo turno.' },
    { id: 'dps-d2', name: 'Refletir', category: 'defense', group: 'defense2', shortDescription: 'Reflete parte do dano recebido.' }
  ]
}

export function getRoleCards(role: UnitRole) {
  return roleCards[role]
}
