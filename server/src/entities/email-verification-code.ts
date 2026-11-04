import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { EmailVerificationCode } from '@buyerly/shared';
import { WorkspaceInviteEntity } from './workspace-invite.ts';

@Index('ix_email_verification_codes_delivered_at', ['deliveredAt'])
@Index('ix_email_verification_codes_email', ['email'])
@Index('ix_email_verification_codes_expires_at', ['expiresAt'])
@Index('ix_email_verification_codes_invite_id', ['inviteId'])
@Index('ix_email_verification_codes_link_token_hash', ['linkTokenHash'], { unique: true })
@Index('ix_email_verification_codes_scope', ['scope'])
@Index('uq_email_verification_codes_active_scope', ['scope'], { unique: true, where: '(is_used = false)' })
@Entity({ name: 'email_verification_codes' })
export class EmailVerificationCodeEntity implements EmailVerificationCode {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'email', type: 'varchar' })
  email!: string;

  @Column({ name: 'code', type: 'varchar', length: 10 })
  code: string = '';

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'is_used', type: 'boolean' })
  isUsed: boolean = false;

  @Column({ name: 'failed_attempts', type: 'integer' })
  failedAttempts: number = 0;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash!: string;

  @Column({ name: 'purpose', type: 'varchar', length: 32 })
  purpose!: string;

  @Column({ name: 'scope', type: 'varchar', length: 320 })
  scope!: string;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'link_token_hash', type: 'varchar', length: 64, nullable: true })
  linkTokenHash!: string | null;

  @Column({ name: 'invite_id', type: 'integer', nullable: true })
  inviteId!: number | null;

  @ManyToOne(() => WorkspaceInviteEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invite_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_email_verification_codes_invite' })
  invite?: Relation<WorkspaceInviteEntity>;
}
