import { BeforeUpdate, Column, Entity, PrimaryColumn } from 'typeorm';
import type { AutomationRuntimeState, JsonObject } from '@buyerly/shared';

@Entity({ name: 'automation_runtime_states' })
export class AutomationRuntimeStateEntity implements AutomationRuntimeState {
  @PrimaryColumn({ name: 'state_key', type: 'varchar' })
  stateKey: string = 'monitoring';

  @Column({ name: 'payload', type: 'jsonb' })
  payload: JsonObject = {};

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date = new Date();

  // models.py sets updatedAt on every ORM update (onupdate=utcnow).
  @BeforeUpdate()
  protected touch(): void {
    this.updatedAt = new Date();
  }
}
