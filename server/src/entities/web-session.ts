import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation, Unique } from 'typeorm';
import type { WebSession } from '@buyerly/shared';
import { UserEntity } from './user.ts';

@Unique('web_sessions_token_hash_key', ['tokenHash'])
@Index('ix_web_sessions_expires_at', ['expiresAt'])
@Index('ix_web_sessions_revoked_at', ['revokedAt'])
@Index('ix_web_sessions_token_hash', ['tokenHash'], { unique: true })
@Index('ix_web_sessions_user_id', ['userId'])
@Entity({ name: 'web_sessions' })
export class WebSessionEntity implements WebSession {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 36 })
  id!: string;

  @Column({ name: 'user_id', type: 'integer' })
  userId!: number;

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'csrf_hash', type: 'varchar', length: 64 })
  csrfHash!: string;

  @Column({ name: 'user_agent', type: 'varchar', length: 500 })
  userAgent: string = '';

  @Column({ name: 'ip_address', type: 'varchar', length: 64 })
  ipAddress: string = '';

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date = new Date();

  @Column({ name: 'rotated_at', type: 'timestamptz' })
  rotatedAt: Date = new Date();

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ name: 'location', type: 'varchar', length: 128, default: () => "''::character varying" })
  location: string = '';

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'web_sessions_user_id_fkey' })
  user?: Relation<UserEntity>;
}
