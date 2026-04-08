import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service.js';
import { EmailService } from '../email/email.service.js';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity.js';

export interface JwtPayload {
  sub: string;
  username: string;
}

export interface AuthResult {
  accessToken: string;
  user: Omit<User, 'passwordHash'>;
}

export interface PendingVerificationResult {
  pendingVerification: true;
  userId: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<Omit<User, 'passwordHash'> | null> {
    const user = await this.usersService.findByUsername(username);
    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      const { passwordHash: _, ...result } = user;
      return result;
    }
    return null;
  }

  async login(
    username: string,
    password: string,
    deviceId?: string,
  ): Promise<AuthResult | PendingVerificationResult> {
    const user = await this.validateUser(username, password);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // If user has a known device and email is verified, grant access immediately
    if (
      deviceId &&
      user.emailVerified &&
      (await this.usersService.isKnownDevice(user.id, deviceId))
    ) {
      const payload: JwtPayload = {
        sub: user.id,
        username: user.username,
      };
      return {
        accessToken: this.jwtService.sign(payload),
        user,
      };
    }

    // New device or unverified email: send verification code
    const code = this.generateCode();
    await this.usersService.setVerificationCode(user.id, code);
    await this.emailService.sendVerificationCode(user.email, code);

    return {
      pendingVerification: true,
      userId: user.id,
    };
  }

  async register(
    username: string,
    email: string,
    password: string,
  ): Promise<PendingVerificationResult> {
    // Check if user already exists
    const existingUser = await this.usersService.findByUsername(username);
    if (existingUser) {
      throw new UnauthorizedException('Username already taken');
    }
    const existingEmail = await this.usersService.findByEmail(email);
    if (existingEmail) {
      throw new UnauthorizedException('Email already registered');
    }

    const newUser = await this.usersService.create(
      username,
      email,
      password,
    );

    // Generate and send verification code
    const code = this.generateCode();
    await this.usersService.setVerificationCode(newUser.id, code);
    await this.emailService.sendVerificationCode(email, code);

    return {
      pendingVerification: true,
      userId: newUser.id,
    };
  }

  async verifyEmail(
    userId: string,
    code: string,
    deviceId?: string,
  ): Promise<AuthResult> {
    const valid = await this.usersService.verifyCode(userId, code);
    if (!valid) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Store device so future logins from it skip verification
    if (deviceId) {
      await this.usersService.setDeviceId(userId, deviceId);
    }

    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const { passwordHash: _, ...safeUser } = user;
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: safeUser,
    };
  }

  async resendCode(userId: string): Promise<{ sent: true }> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const code = this.generateCode();
    await this.usersService.setVerificationCode(user.id, code);
    await this.emailService.sendVerificationCode(user.email, code);

    return { sent: true };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }
}
