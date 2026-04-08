import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity()
export class SkillInventory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: false })
  user!: User;

  @Column()
  userId!: string;

  @Column()
  skillId!: string; // references skillCatalog ID

  @Column({ default: 1 })
  level!: number; // 1-5, upgrade by merging

  @Column()
  unitClass!: string; // king, warrior, executor, specialist
}
