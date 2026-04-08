import { ApiClient } from './ApiClient'

export interface DeckConfigDTO {
  unitClass: string
  attackSkillIds: string[]
  defenseSkillIds: string[]
}

export interface SkillInventoryItem {
  id: string
  skillId: string
  level: number
  unitClass: string
}

export interface PlayerProfileDTO {
  attackMastery: number
  defenseMastery: number
  offlineAttacksRemaining: number
  offlineDefensesRemaining: number
}

export class GameService {
  constructor(private api: ApiClient) {}

  async getProfile(): Promise<PlayerProfileDTO> {
    return this.api.get<PlayerProfileDTO>('/api/game/profile')
  }

  async getSkills(): Promise<SkillInventoryItem[]> {
    return this.api.get<SkillInventoryItem[]>('/api/game/skills')
  }

  async getDecks(): Promise<DeckConfigDTO[]> {
    return this.api.get<DeckConfigDTO[]>('/api/game/decks')
  }

  async saveDeck(deck: DeckConfigDTO): Promise<DeckConfigDTO> {
    return this.api.post<DeckConfigDTO>('/api/game/decks', deck)
  }

  async joinQueue(mode: '1v1' | '2v2' | '4v4'): Promise<{ status: string; matchId?: string }> {
    return this.api.post('/api/matchmaking/queue', { mode })
  }

  async leaveQueue(mode: string): Promise<void> {
    await this.api.delete(`/api/matchmaking/queue/${mode}`)
  }
}
