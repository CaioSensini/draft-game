import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity()
export class PlayerProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: true })
  user!: User;

  @Column()
  userId!: string;

  @Column({ default: 0 })
  attackMastery!: number; // earned from winning attacks

  @Column({ default: 0 })
  defenseMastery!: number; // earned from winning defenses

  @Column({ default: 10 })
  offlineAttacksRemaining!: number; // max 10/day

  @Column({ default: 10 })
  offlineDefensesRemaining!: number; // max 10/day

  @Column({ type: 'timestamp', nullable: true })
  lastAttackReset!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastDefenseReset!: Date | null;
}
