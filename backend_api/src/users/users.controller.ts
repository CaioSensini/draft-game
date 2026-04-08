import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UsersService } from './users.service.js';

@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  async getMe(@Request() req: { user: { userId: string } }) {
    const user = await this.usersService.findById(req.user.userId);
    if (!user) {
      return { error: 'User not found' };
    }
    // Strip password hash from response
    const { passwordHash: _, ...safeUser } = user;
    return safeUser;
  }
}
