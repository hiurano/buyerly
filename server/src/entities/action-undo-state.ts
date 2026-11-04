import { BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import type { ActionUndoState, JsonObject } from '@buyerly/shared';
import { AuditEventEntity } from './audit-event.ts';
import { UserEntity } from './user.ts';

@Index('ix_action_undo_states_correlation_id', ['correlationId'])
@Index('ix_action_undo_states_original_event_id', ['originalEventId'], { unique: true })
@Index('ix_action_undo_states_owner_user_id', ['ownerUserId'])
@Index('ix_action_undo_states_status', ['status'])
@Entity({ name: 'action_undo_states' })
export class ActionUndoStateEntity implements ActionUndoState {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'original_event_id', type: 'integer' })
  originalEventId!: number;

  @Column({ name: 'owner_user_id', type: 'integer', nullable: true })
  ownerUserId!: number | null;

  @Column({ name: 'status', type: 'varchar' })
  status: string = 'PENDING';

  @Column({ name: 'correlation_id', type: 'varchar' })
  correlationId: string = '';

  @Column({ name: 'attempt_count', type: 'integer' })
  attemptCount: number = 1;

  @Column({ name: 'expected_state', type: 'jsonb' })
  expectedState: JsonObject = {};

  @Column({ name: 'desired_state', type: 'jsonb' })
  desiredState: JsonObject = {};

  @Column({ name: 'last_error', type: 'text' })
  lastError: string = '';

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date = new Date();

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  @ManyToOne(() => AuditEventEntity)
  @JoinColumn({ name: 'original_event_id', referencedColumnName: 'id', foreignKeyConstraintName: 'action_undo_states_original_event_id_fkey' })
  originalEvent?: Relation<AuditEventEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'action_undo_states_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
