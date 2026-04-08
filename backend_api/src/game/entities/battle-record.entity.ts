import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity()
export class BattleRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  mode!: string; // '1v1', '2v2', '4v4', 'pve'

  @Column('simple-json')
  teams!: { side: string; players: string[] }[];

  // 🔧 ajuste aqui (garante compatibilidade total com PostgreSQL)
  @Column({ type: 'varchar', nullable: true })
  winningSide!: string | null;

  @Column({ default: 0 })
  rounds!: number;

  @Column({ default: 0 })
  xpAwarded!: number;

  @Column({ default: 0 })
  goldAwarded!: number;

  @CreateDateColumn()
  playedAt!: Date;
}