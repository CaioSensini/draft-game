import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { username } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async create(
    username: string,
    email: string,
    password: string,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash(password, 12);
    const user = this.usersRepository.create({
      username,
      email,
      passwordHash,
    });
    return this.usersRepository.save(user);
  }

  async addXp(userId: string, amount: number): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.xp += amount;

    // Level up every 1000 XP
    while (user.xp >= user.level * 1000) {
      user.xp -= user.level * 1000;
      user.level += 1;
    }

    return this.usersRepository.save(user);
  }

  async addGold(userId: string, amount: number): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.gold += amount;
    return this.usersRepository.save(user);
  }

  async addDg(userId: string, amount: number): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.dg += amount;
    return this.usersRepository.save(user);
  }

  async updateRankPoints(
    userId: string,
    delta: number,
  ): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.rankPoints = Math.max(0, user.rankPoints + delta);
    return this.usersRepository.save(user);
  }

  async recordWin(userId: string): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.wins += 1;
    return this.usersRepository.save(user);
  }

  async recordLoss(userId: string): Promise<User> {
    const user = await this.usersRepository.findOneOrFail({
      where: { id: userId },
    });
    user.losses += 1;
    return this.usersRepository.save(user);
  }

  async setVerificationCode(
    userId: string,
    code: string,
    expiryMinutes = 10,
  ): Promise<void> {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + expiryMinutes);
    await this.usersRepository.update(userId, {
      verificationCode: code,
      verificationCodeExpiry: expiry,
    });
  }

  async verifyCode(userId: string, code: string): Promise<boolean> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    if (
      !user ||
      !user.verificationCode ||
      !user.verificationCodeExpiry
    ) {
      return false;
    }
    if (new Date() > user.verificationCodeExpiry) return false; // expired
    if (user.verificationCode !== code) return false;
    // Clear the code and mark as verified
    await this.usersRepository.update(userId, {
      verificationCode: null,
      verificationCodeExpiry: null,
      emailVerified: true,
    });
    return true;
  }

  async setDeviceId(userId: string, deviceId: string): Promise<void> {
    await this.usersRepository.update(userId, { lastDeviceId: deviceId });
  }

  async isKnownDevice(
    userId: string,
    deviceId: string,
  ): Promise<boolean> {
    const user = await this.usersRepository.findOneBy({ id: userId });
    return user?.lastDeviceId === deviceId;
  }
}
