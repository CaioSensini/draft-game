import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MatchmakingService } from './matchmaking.service.js';

class JoinQueueDto {
  mode!: '1v1' | '2v2' | '4v4';
}

@Controller('api/matchmaking')
@UseGuards(AuthGuard('jwt'))
export class MatchmakingController {
  constructor(private readonly matchmakingService: MatchmakingService) {}

  @Post('queue')
  async joinQueue(
    @Request() req: { user: { userId: string; username: string } },
    @Body() body: JoinQueueDto,
  ) {
    return this.matchmakingService.joinQueue(
      req.user.userId,
      req.user.username,
      0, // TODO: fetch actual rank points from user
      body.mode,
    );
  }

  @Delete('queue/:mode')
  async leaveQueue(
    @Request() req: { user: { userId: string } },
    @Param('mode') mode: string,
  ) {
    const left = this.matchmakingService.leaveQueue(req.user.userId, mode);
    return { left };
  }

  @Get('queue/:mode/status')
  async getQueueStatus(@Param('mode') mode: string) {
    return this.matchmakingService.getQueueStatus(mode);
  }
}
