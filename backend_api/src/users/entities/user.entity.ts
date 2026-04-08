import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  username!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column({ default: 1 })
  level!: number;

  @Column({ default: 0 })
  xp!: number;

  @Column({ default: 500 })
  gold!: number;

  @Column({ default: 0 })
  dg!: number; // premium currency (Draft Gold)

  @Column({ default: 0 })
  rankPoints!: number;

  @Column({ default: 0 })
  wins!: number;

  @Column({ default: 0 })
  losses!: number;

  @Column({ default: false })
  emailVerified!: boolean;

  @Column({ nullable: true, type: 'varchar' })
  verificationCode!: string | null;

  @Column({ nullable: true, type: 'timestamp' })
  verificationCodeExpiry!: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  lastDeviceId!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
