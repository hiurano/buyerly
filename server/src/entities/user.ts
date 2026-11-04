import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { User } from '@buyerly/shared';
import { WorkspaceEntity } from './workspace.ts';

@Index('ix_users_active_workspace_id', ['activeWorkspaceId'])
@Index('ix_users_auth_token', ['authToken'], { unique: true })
@Index('ix_users_email', ['email'], { unique: true })
@Index('ix_users_email_verified_at', ['emailVerifiedAt'])
@Index('ix_users_telegram_id', ['telegramId'], { unique: true })
@Index('ix_users_unconfirmed_email', ['unconfirmedEmail'])
@Index('ix_users_username', ['username'], { unique: true })
@Entity({ name: 'users' })
export class UserEntity implements User {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'telegram_id', type: 'varchar', nullable: true })
  telegramId!: string | null;

  @Column({ name: 'username', type: 'varchar' })
  username!: string;

  @Column({ name: 'full_name', type: 'varchar' })
  fullName: string = '';

  @Column({ name: 'first_name', type: 'varchar' })
  firstName: string = '';

  @Column({ name: 'last_name', type: 'varchar' })
  lastName: string = '';

  @Column({ name: 'email', type: 'varchar', nullable: true })
  email!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar' })
  avatarUrl: string = '';

  @Column({ name: 'onboarding_step', type: 'varchar' })
  onboardingStep: string = 'personal_details';

  @Column({ name: 'onboarding_completed', type: 'boolean' })
  onboardingCompleted: boolean = false;

  @Column({ name: 'auth_token', type: 'varchar', nullable: true })
  authToken!: string | null;

  @Column({ name: 'role', type: 'varchar' })
  role: string = 'admin';

  @Column({ name: 'is_approved', type: 'boolean' })
  isApproved: boolean = true;

  @Column({ name: 'active_workspace_id', type: 'integer', nullable: true })
  activeWorkspaceId!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ name: 'unconfirmed_email', type: 'varchar', nullable: true })
  unconfirmedEmail!: string | null;

  @Column({ name: 'title', type: 'varchar', length: 128, default: () => "''::character varying" })
  title!: string;

  @ManyToOne(() => WorkspaceEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'active_workspace_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_users_active_workspace' })
  activeWorkspace?: Relation<WorkspaceEntity>;
}
