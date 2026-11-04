import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation, Unique } from 'typeorm';
import type { MetaConnectionAsset } from '@buyerly/shared';
import { MetaConnectionEntity } from './meta-connection.ts';
import { UserEntity } from './user.ts';

@Unique('uq_meta_connection_asset_account', ['connectionId', 'metaAccountId'])
@Index('ix_meta_connection_assets_business_id', ['businessId'])
@Index('ix_meta_connection_assets_connection_id', ['connectionId'])
@Index('ix_meta_connection_assets_meta_account_id', ['metaAccountId'])
@Index('ix_meta_connection_assets_owner_user_id', ['ownerUserId'])
@Entity({ name: 'meta_connection_assets' })
export class MetaConnectionAssetEntity implements MetaConnectionAsset {
  @PrimaryGeneratedColumn({ name: 'id', type: 'integer' })
  id!: number;

  @Column({ name: 'connection_id', type: 'integer' })
  connectionId!: number;

  @Column({ name: 'owner_user_id', type: 'integer' })
  ownerUserId!: number;

  @Column({ name: 'meta_account_id', type: 'varchar' })
  metaAccountId!: string;

  @Column({ name: 'name', type: 'varchar' })
  name: string = '';

  @Column({ name: 'business_id', type: 'varchar' })
  businessId: string = '';

  @Column({ name: 'business_name', type: 'varchar' })
  businessName: string = 'No Business Manager';

  @Column({ name: 'account_status', type: 'integer' })
  accountStatus: number = 1;

  @Column({ name: 'currency', type: 'varchar' })
  currency: string = 'UNKNOWN';

  @Column({ name: 'timezone_name', type: 'varchar' })
  timezoneName: string = 'UTC';

  @Column({ name: 'discovered_at', type: 'timestamptz' })
  discoveredAt: Date = new Date();

  @ManyToOne(() => MetaConnectionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connection_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connection_assets_connection_id_fkey' })
  connection?: Relation<MetaConnectionEntity>;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_user_id', referencedColumnName: 'id', foreignKeyConstraintName: 'meta_connection_assets_owner_user_id_fkey' })
  ownerUser?: Relation<UserEntity>;
}
