import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity()
export class DeckConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: false })
  user!: User;

  @Column()
  userId!: string;

  @Column()
  unitClass!: string; // king, warrior, executor, specialist

  @Column('simple-array')
  attackSkillIds!: string[]; // 4 skill IDs

  @Column('simple-array')
  defenseSkillIds!: string[]; // 4 skill IDs
}
