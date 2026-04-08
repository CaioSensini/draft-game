export interface PlayerData {
  username: string
  level: number
  xp: number
  gold: number
  dg: number
  wins: number
  losses: number
  rankPoints: number
  attackMastery: number
  defenseMastery: number
  ownedSkills: OwnedSkill[]
  deckConfig: Record<string, { attackCards: string[]; defenseCards: string[] }>
}

export interface OwnedSkill {
  skillId: string
  level: number // 1-5
  unitClass: string
}

const STORAGE_KEY = 'draft_player_data'
const DATA_VERSION = 2  // bump when schema changes to force re-creation
const XP_PER_LEVEL = [
  0, 100, 250, 500, 800, 1200, 1700, 2300, 3000, 3800, 4700, 5700, 6800,
  8000, 9300, 10700, 12200, 13800, 15500, 17300,
] // 20 levels

class PlayerDataManager {
  private data: PlayerData

  constructor() {
    this.data = this.load()
  }

  private load(): PlayerData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as PlayerData & { _version?: number }
        // If old schema (missing deckConfig or wrong version), reset to defaults
        if (!parsed.deckConfig || (parsed._version ?? 0) < DATA_VERSION) {
          return this.createDefault()
        }
        return parsed
      }
    } catch {
      /* corrupted data, use defaults */
    }
    return this.createDefault()
  }

  private createDefault(): PlayerData {
    // 8 starter skills per class (4 atk + 4 def) = 32 total
    const ownedSkills: OwnedSkill[] = [
      // King
      { skillId: 'lk_a1', level: 1, unitClass: 'king' },
      { skillId: 'lk_a3', level: 1, unitClass: 'king' },
      { skillId: 'lk_a6', level: 1, unitClass: 'king' },
      { skillId: 'lk_a7', level: 1, unitClass: 'king' },
      { skillId: 'lk_d2', level: 1, unitClass: 'king' },
      { skillId: 'lk_d3', level: 1, unitClass: 'king' },
      { skillId: 'lk_d5', level: 1, unitClass: 'king' },
      { skillId: 'lk_d6', level: 1, unitClass: 'king' },
      // Warrior
      { skillId: 'lw_a1', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_a2', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_a6', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_a7', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_d1', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_d8', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_d4', level: 1, unitClass: 'warrior' },
      { skillId: 'lw_d5', level: 1, unitClass: 'warrior' },
      // Specialist
      { skillId: 'ls_a1', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_a2', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_a5', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_a6', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_d1', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_d4', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_d5', level: 1, unitClass: 'specialist' },
      { skillId: 'ls_d7', level: 1, unitClass: 'specialist' },
      // Executor
      { skillId: 'le_a1', level: 1, unitClass: 'executor' },
      { skillId: 'le_a2', level: 1, unitClass: 'executor' },
      { skillId: 'le_a5', level: 1, unitClass: 'executor' },
      { skillId: 'le_a6', level: 1, unitClass: 'executor' },
      { skillId: 'le_d1', level: 1, unitClass: 'executor' },
      { skillId: 'le_d2', level: 1, unitClass: 'executor' },
      { skillId: 'le_d7', level: 1, unitClass: 'executor' },
      { skillId: 'le_d8', level: 1, unitClass: 'executor' },
    ]
    return {
      _version: DATA_VERSION,
      username: 'Jogador',
      level: 1,
      xp: 0,
      gold: 500,
      dg: 0,
      wins: 0,
      losses: 0,
      rankPoints: 0,
      attackMastery: 0,
      defenseMastery: 0,
      ownedSkills,
      deckConfig: {
        king: {
          attackCards: ['lk_a1', 'lk_a3', 'lk_a6', 'lk_a7'],
          defenseCards: ['lk_d2', 'lk_d3', 'lk_d5', 'lk_d6'],
        },
        warrior: {
          attackCards: ['lw_a1', 'lw_a2', 'lw_a6', 'lw_a7'],
          defenseCards: ['lw_d1', 'lw_d8', 'lw_d4', 'lw_d5'],
        },
        specialist: {
          attackCards: ['ls_a1', 'ls_a2', 'ls_a5', 'ls_a6'],
          defenseCards: ['ls_d1', 'ls_d4', 'ls_d5', 'ls_d7'],
        },
        executor: {
          attackCards: ['le_a1', 'le_a2', 'le_a5', 'le_a6'],
          defenseCards: ['le_d1', 'le_d2', 'le_d7', 'le_d8'],
        },
      },
    } as PlayerData
  }

  private save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data))
  }

  // -- Getters --

  get(): PlayerData {
    return { ...this.data }
  }

  getGold(): number {
    return this.data.gold
  }

  getDG(): number {
    return this.data.dg
  }

  getLevel(): number {
    return this.data.level
  }

  getXP(): number {
    return this.data.xp
  }

  getSkills(): OwnedSkill[] {
    return [...this.data.ownedSkills]
  }

  getDeckConfig(): Record<string, { attackCards: string[]; defenseCards: string[] }> {
    return { ...this.data.deckConfig }
  }

  saveDeckConfig(unitClass: string, attackCards: string[], defenseCards: string[]): void {
    this.data.deckConfig[unitClass] = { attackCards, defenseCards }
    this.save()
  }

  // -- Battle rewards --

  addBattleRewards(gold: number, xp: number, won: boolean): void {
    this.data.gold += gold
    this.data.xp += xp
    if (won) this.data.wins++
    else this.data.losses++
    this.checkLevelUp()
    this.save()
  }

  addMastery(type: 'attack' | 'defense', amount: number): void {
    if (type === 'attack') this.data.attackMastery += amount
    else this.data.defenseMastery += amount
    this.save()
  }

  // -- Economy --

  spendGold(amount: number): boolean {
    if (this.data.gold < amount) return false
    this.data.gold -= amount
    this.save()
    return true
  }

  spendDG(amount: number): boolean {
    if (this.data.dg < amount) return false
    this.data.dg -= amount
    this.save()
    return true
  }

  addGold(amount: number): void {
    this.data.gold += amount
    this.save()
  }

  addDG(amount: number): void {
    this.data.dg += amount
    this.save()
  }

  // -- Skills --

  addSkill(skillId: string, unitClass: string, level = 1): void {
    this.data.ownedSkills.push({ skillId, level, unitClass })
    this.save()
  }

  removeSkill(skillId: string, level: number): boolean {
    const idx = this.data.ownedSkills.findIndex(
      (s) => s.skillId === skillId && s.level === level,
    )
    if (idx === -1) return false
    this.data.ownedSkills.splice(idx, 1)
    this.save()
    return true
  }

  fuseSkills(skillId: string, currentLevel: number): boolean {
    // Need 2 of same skill at same level
    const matches = this.data.ownedSkills.filter(
      (s) => s.skillId === skillId && s.level === currentLevel,
    )
    if (matches.length < 2) return false
    if (currentLevel >= 5) return false

    // Fusion cost
    const costs = [0, 100, 300, 700, 1500]
    const cost = costs[currentLevel - 1] ?? 1500
    if (this.data.gold < cost) return false

    // Remove 2, add 1 at next level
    let removed = 0
    this.data.ownedSkills = this.data.ownedSkills.filter((s) => {
      if (
        s.skillId === skillId &&
        s.level === currentLevel &&
        removed < 2
      ) {
        removed++
        return false
      }
      return true
    })
    this.data.ownedSkills.push({
      skillId,
      level: currentLevel + 1,
      unitClass: matches[0].unitClass,
    })
    this.data.gold -= cost
    this.checkLevelUp()
    this.save()
    return true
  }

  // -- Level up --

  private checkLevelUp(): void {
    while (
      this.data.level < 20 &&
      this.data.xp >= XP_PER_LEVEL[this.data.level]
    ) {
      this.data.level++
    }
  }

  // -- Server sync --

  /**
   * Merge server profile data into local state.
   * Called after login/register or token validation.
   * Server fields overwrite local fields; ownedSkills stay local for now.
   */
  syncFromServer(serverUser: {
    username?: string
    level?: number
    xp?: number
    gold?: number
    dg?: number
    rankPoints?: number
    wins?: number
    losses?: number
  }): void {
    if (serverUser.username !== undefined) this.data.username = serverUser.username
    if (serverUser.level !== undefined) this.data.level = serverUser.level
    if (serverUser.xp !== undefined) this.data.xp = serverUser.xp
    if (serverUser.gold !== undefined) this.data.gold = serverUser.gold
    if (serverUser.dg !== undefined) this.data.dg = serverUser.dg
    if (serverUser.rankPoints !== undefined) this.data.rankPoints = serverUser.rankPoints
    if (serverUser.wins !== undefined) this.data.wins = serverUser.wins
    if (serverUser.losses !== undefined) this.data.losses = serverUser.losses
    this.save()
  }

  // -- Reset (for testing) --

  reset(): void {
    this.data = this.createDefault()
    this.save()
  }
}

export const playerData = new PlayerDataManager()
