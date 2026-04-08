import { Controller, Post, Body } from '@nestjs/common';
import {
  IsString,
  IsEmail,
  MinLength,
  IsOptional,
  IsUUID,
  Length,
} from 'class-validator';
import { AuthService } from './auth.service.js';

class RegisterDto {
  @IsString()
  username!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

class LoginDto {
  @IsString()
  username!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}

class VerifyDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(6, 6)
  code!: string;

  @IsString()
  @IsOptional()
  deviceId?: string;
}

class ResendDto {
  @IsUUID()
  userId!: string;
}

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.authService.register(body.username, body.email, body.password);
  }

  @Post('login')
  async login(@Body() body: LoginDto) {
    return this.authService.login(body.username, body.password, body.deviceId);
  }

  @Post('verify')
  async verify(@Body() body: VerifyDto) {
    return this.authService.verifyEmail(body.userId, body.code, body.deviceId);
  }

  @Post('resend')
  async resend(@Body() body: ResendDto) {
    return this.authService.resendCode(body.userId);
  }
}
