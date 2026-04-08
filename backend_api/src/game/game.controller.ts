import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GameService } from './game.service.js';

class SaveDeckDto {
  unitClass!: string;
  attackSkillIds!: string[];
  defenseSkillIds!: string[];
}

@Controller('api')
@UseGuards(AuthGuard('jwt'))
export class GameController {
  constructor(private readonly gameService: GameService) {}

  @Get('profile')
  async getProfile(@Request() req: { user: { userId: string } }) {
    return this.gameService.getOrCreateProfile(req.user.userId);
  }

  @Get('skills')
  async getSkills(@Request() req: { user: { userId: string } }) {
    return this.gameService.getSkills(req.user.userId);
  }

  @Get('decks')
  async getDecks(@Request() req: { user: { userId: string } }) {
    return this.gameService.getDecks(req.user.userId);
  }

  @Post('decks')
  async saveDeck(
    @Request() req: { user: { userId: string } },
    @Body() body: SaveDeckDto,
  ) {
    return this.gameService.saveDeck(
      req.user.userId,
      body.unitClass,
      body.attackSkillIds,
      body.defenseSkillIds,
    );
  }

  @Get('battles/:id')
  async getBattle(@Param('id') id: string) {
    return this.gameService.getBattle(id);
  }
}
