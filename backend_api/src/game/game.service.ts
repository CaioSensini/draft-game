import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlayerProfile } from './entities/player-profile.entity.js';
import { SkillInventory } from './entities/skill-inventory.entity.js';
import { DeckConfig } from './entities/deck-config.entity.js';
import { BattleRecord } from './entities/battle-record.entity.js';

@Injectable()
export class GameService {
  constructor(
    @InjectRepository(PlayerProfile)
    private readonly profileRepo: Repository<PlayerProfile>,
    @InjectRepository(SkillInventory)
    private readonly skillRepo: Repository<SkillInventory>,
    @InjectRepository(DeckConfig)
    private readonly deckRepo: Repository<DeckConfig>,
    @InjectRepository(BattleRecord)
    private readonly battleRepo: Repository<BattleRecord>,
  ) {}

  // --- Player Profile ---

  async getOrCreateProfile(userId: string): Promise<PlayerProfile> {
    let profile = await this.profileRepo.findOne({
      where: { userId },
    });
    if (!profile) {
      profile = this.profileRepo.create({ userId });
      profile = await this.profileRepo.save(profile);
    }
    return profile;
  }

  async resetDailyAttacks(userId: string): Promise<PlayerProfile> {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const last = profile.lastAttackReset;

    if (!last || now.getTime() - last.getTime() > 24 * 60 * 60 * 1000) {
      profile.offlineAttacksRemaining = 10;
      profile.lastAttackReset = now;
      return this.profileRepo.save(profile);
    }
    return profile;
  }

  async resetDailyDefenses(userId: string): Promise<PlayerProfile> {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const last = profile.lastDefenseReset;

    if (!last || now.getTime() - last.getTime() > 24 * 60 * 60 * 1000) {
      profile.offlineDefensesRemaining = 10;
      profile.lastDefenseReset = now;
      return this.profileRepo.save(profile);
    }
    return profile;
  }

  // --- Skill Inventory ---

  async getSkills(userId: string): Promise<SkillInventory[]> {
    return this.skillRepo.find({ where: { userId } });
  }

  async addSkill(
    userId: string,
    skillId: string,
    unitClass: string,
  ): Promise<SkillInventory> {
    const skill = this.skillRepo.create({ userId, skillId, unitClass });
    return this.skillRepo.save(skill);
  }

  async upgradeSkill(inventoryId: string): Promise<SkillInventory> {
    const skill = await this.skillRepo.findOne({
      where: { id: inventoryId },
    });
    if (!skill) {
      throw new NotFoundException('Skill not found in inventory');
    }
    if (skill.level >= 5) {
      throw new Error('Skill already at max level');
    }
    skill.level += 1;
    return this.skillRepo.save(skill);
  }

  // --- Deck Config ---

  async getDecks(userId: string): Promise<DeckConfig[]> {
    return this.deckRepo.find({ where: { userId } });
  }

  async saveDeck(
    userId: string,
    unitClass: string,
    attackSkillIds: string[],
    defenseSkillIds: string[],
  ): Promise<DeckConfig> {
    // Upsert: find existing deck for this user+unitClass or create new
    let deck = await this.deckRepo.findOne({
      where: { userId, unitClass },
    });
    if (deck) {
      deck.attackSkillIds = attackSkillIds;
      deck.defenseSkillIds = defenseSkillIds;
    } else {
      deck = this.deckRepo.create({
        userId,
        unitClass,
        attackSkillIds,
        defenseSkillIds,
      });
    }
    return this.deckRepo.save(deck);
  }

  // --- Battle Records ---

  async getBattle(battleId: string): Promise<BattleRecord> {
    const battle = await this.battleRepo.findOne({
      where: { id: battleId },
    });
    if (!battle) {
      throw new NotFoundException('Battle not found');
    }
    return battle;
  }

  async createBattleRecord(
    mode: string,
    teams: { side: string; players: string[] }[],
  ): Promise<BattleRecord> {
    const battle = this.battleRepo.create({ mode, teams });
    return this.battleRepo.save(battle);
  }

  async completeBattle(
    battleId: string,
    winningSide: string,
    rounds: number,
    xpAwarded: number,
    goldAwarded: number,
  ): Promise<BattleRecord> {
    const battle = await this.getBattle(battleId);
    battle.winningSide = winningSide;
    battle.rounds = rounds;
    battle.xpAwarded = xpAwarded;
    battle.goldAwarded = goldAwarded;
    return this.battleRepo.save(battle);
  }
}
