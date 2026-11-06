import { readConfig } from '../config.ts';
import { connectDatabase, type Database } from '../database.ts';
import { MetaTokenKeyring, rotateStoredMetaTokens, type RotationStats } from './tokens.ts';

// Re-encrypt every stored Meta token with the primary key of
// META_TOKEN_ENCRYPTION_KEY (it replaced scripts/rotate_meta_tokens.py): after a new key
// is prepended, run it once, then the old key can be dropped. The worker can
// run the same function on a schedule (rotateMetaTokens).
//
//   node server/dist/meta/rotate-tokens.js

export async function rotateMetaTokens(database: Database, encryptionKey: string): Promise<RotationStats> {
  const keyring = new MetaTokenKeyring(encryptionKey);
  return database.transaction((tx) => rotateStoredMetaTokens(tx, keyring));
}

async function main(): Promise<number> {
  const config = readConfig();
  const database = connectDatabase(config.databaseUrl);
  if (!database) {
    console.error('Token rotation failed: DATABASE_URL is not set');
    return 1;
  }
  console.info('Starting Meta token rotation');
  try {
    const stats = await rotateMetaTokens(database, config.metaTokenEncryptionKey);
    console.info(`Token rotation complete: ${stats.connections_rotated} connection(s), ${stats.accounts_rotated} account(s)`);
    return 0;
  } catch (error) {
    console.error(`Token rotation failed: ${(error as Error).message}`);
    return 1;
  } finally {
    await database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = await main();
