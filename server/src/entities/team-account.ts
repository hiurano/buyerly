import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { TeamAccount } from '@buyerly/shared';
import { AccountEntity } from './account.ts';
import { TeamEntity } from './team.ts';

@Unique('uq_team_account', ['teamId', 'accountId'])
@Index('ix_team_accounts_account_id', ['accountId'])
@Index('ix_team_accounts_team_id', ['teamId'])
@Entity({ name: 'team_accounts' })
export class TeamAccountEntity implements TeamAccount {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'team_id', type: 'integer' })
  teamId!: number;

  @Column({ name: 'account_id', type: 'integer' })
  accountId!: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @ManyToOne(() => AccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_accounts_account_id_fkey' })
  account?: Relation<AccountEntity>;

  @ManyToOne(() => TeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_accounts_team_id_fkey' })
  team?: Relation<TeamEntity>;
}
