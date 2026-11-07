import { Baseline1762473600000 } from './1762473600000-baseline.ts';

// Every migration, oldest first (#611 stage 5). A new one is a class in this
// folder named <unix ms>-<what>.ts, added here; `node server/dist/migrate.js`
// runs the pending ones, each in its own transaction.
export const MIGRATIONS = [Baseline1762473600000];
