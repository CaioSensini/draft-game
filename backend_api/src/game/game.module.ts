import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlayerProfile } from './entities/player-profile.entity.js';
import { SkillInventory } from './entities/skill-inventory.entity.js';
import { DeckConfig } from './entities/deck-config.entity.js';
import { BattleRecord } from './entities/battle-record.entity.js';
import { GameService } from './game.service.js';
import { GameController } from './game.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlayerProfile,
      SkillInventory,
      DeckConfig,
      BattleRecord,
    ]),
  ],
  controllers: [GameController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
