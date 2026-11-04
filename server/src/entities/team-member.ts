import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { TeamMember } from '@buyerly/shared';
import { TeamEntity } from './team.ts';
import { WorkspaceMemberEntity } from './workspace-member.ts';

@Unique('uq_team_member', ['teamId', 'memberId'])
@Index('ix_team_members_member_id', ['memberId'])
@Index('ix_team_members_team_id', ['teamId'])
@Entity({ name: 'team_members' })
export class TeamMemberEntity implements TeamMember {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'team_id', type: 'integer' })
  teamId!: number;

  @Column({ name: 'member_id', type: 'integer' })
  memberId!: number;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date = new Date();

  @Column({ name: 'is_owner', type: 'boolean', default: () => 'false' })
  isOwner: boolean = false;

  @ManyToOne(() => WorkspaceMemberEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'member_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_members_member_id_fkey' })
  member?: Relation<WorkspaceMemberEntity>;

  @ManyToOne(() => TeamEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id', referencedColumnName: 'id', foreignKeyConstraintName: 'team_members_team_id_fkey' })
  team?: Relation<TeamEntity>;
}
