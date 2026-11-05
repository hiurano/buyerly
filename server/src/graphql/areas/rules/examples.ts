import type { EntityManager } from 'typeorm';
import type { Database } from '../../../database.ts';
import { rows } from '../../../database.ts';
import type { UserEntity } from '../../../entities/index.ts';

// Ready-made rules every workspace starts with (core/rule_examples.py, #386):
// the Netherlands lead-gen ad set test ladder, created once per workspace,
// unattached, under one label. A version marker remembers what a workspace
// already got, so deleting an example is permanent and a new version adds
// its set once. The definitions are the Python module's, value for value;
// they pass the runtime rule check there (validate_runtime_rule), so they
// are written here as they stand.

export const RULE_EXAMPLES_VERSION = 2;
const EXAMPLE_TIME_WINDOW = 'lifetime';

interface ExamplePreset {
  key: string;
  name: string;
  conditions: { metric: string; operator: string; value: number; time_window: string }[];
}

function turnOff(key: string, name: string, ...conditions: [string, string, number][]): ExamplePreset {
  return {
    key,
    name,
    conditions: conditions.map(([metric, operator, value]) => ({ metric, operator, value, time_window: EXAMPLE_TIME_WINDOW })),
  };
}

const EXAMPLE_PRESETS: readonly ExamplePreset[] = [
  turnOff('nl_no_click', '$3 and no click', ['spend', 'gte', 3], ['link_clicks', 'eq', 0]),
  turnOff('nl_one_click', '$3.50 and one click', ['spend', 'gte', 3.5], ['link_clicks', 'lte', 1]),
  turnOff('nl_no_lead', '$4 and no lead', ['spend', 'gte', 4], ['leads', 'eq', 0]),
  turnOff('nl_no_registration', '$7 and no registration', ['spend', 'gte', 7], ['registrations', 'eq', 0], ['leads', 'lte', 1]),
  turnOff('nl_ceiling', '$12 ceiling', ['spend', 'gte', 12]),
];

const EXAMPLE_LABELS = [
  {
    name: 'NL launch',
    color: '#f2994a',
    description:
      'Every dollar must buy the next step: no link click by $3.20, no lead by $4, '
      + 'no registration by $7 — the ad set is dead. Don\'t cut before $3 and don\'t '
      + 'push past $7 for “a bit more”. Attach to test campaigns, not the whole ad '
      + 'account: the $12 ceiling turns off any ad set that spent $12, working ones '
      + 'too. Amounts are in the ad account\'s currency; adjust them for accounts not '
      + 'in dollars.',
    presetKeys: EXAMPLE_PRESETS.map((preset) => preset.key),
  },
];

interface Marker { id: number; owner_user_id: number; version: number }

async function markers(tx: EntityManager, workspaceId: number): Promise<Marker[]> {
  return rows<Marker>(tx, 'SELECT id, owner_user_id, version FROM rule_examples_bootstrap WHERE workspace_id = $1', [workspaceId]);
}

const upToDate = (found: Marker[]): boolean => found.some((marker) => marker.version >= RULE_EXAMPLES_VERSION);

// ensure_rule_examples: in a transaction of its own, committed before the
// read that asked, as the Python handler commits it. The workspace row lock
// makes two members opening Rules at once wait for each other; a marker
// another writer inserted first (unique violation) leaves everything as it was.
export async function ensureRuleExamples(db: Database, user: UserEntity, workspaceId: number): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      if (upToDate(await markers(tx, workspaceId))) return false;
      const [workspace] = await rows<{ owner_user_id: number | null }>(
        tx, 'SELECT owner_user_id FROM workspaces WHERE id = $1 FOR UPDATE', [workspaceId],
      );
      if (!workspace) return false;
      const found = await markers(tx, workspaceId);
      if (upToDate(found)) return false;
      const ownerId = workspace.owner_user_id || user.id;
      const ownerMarker = found.find((marker) => marker.owner_user_id === ownerId);
      if (ownerMarker) {
        await rows(tx, 'UPDATE rule_examples_bootstrap SET version = $1 WHERE id = $2', [RULE_EXAMPLES_VERSION, ownerMarker.id]);
      } else {
        await rows(
          tx,
          `INSERT INTO rule_examples_bootstrap (workspace_id, owner_user_id, version, created_at)
           VALUES ($1, $2, $3, clock_timestamp())`,
          [workspaceId, ownerId, RULE_EXAMPLES_VERSION],
        );
      }
      const presetIds = new Map<string, number>();
      for (const preset of EXAMPLE_PRESETS) {
        const [created] = await rows<{ id: number }>(
          tx,
          `INSERT INTO rule_presets
             (workspace_id, owner_user_id, name, action, level, enabled, conditions, condition_logic,
              cooldown_minutes, check_interval_minutes, notify_tg, budget_change_percent, budget_max_daily,
              created_at, updated_at)
           VALUES ($1, $2, $3, 'turn_off', 'adset', true, $4::jsonb, 'and', 1440, 5, true, 0, 0,
                   clock_timestamp(), clock_timestamp())
           RETURNING id`,
          [workspaceId, user.id, preset.name, JSON.stringify(preset.conditions)],
        );
        presetIds.set(preset.key, created.id);
      }
      for (const label of EXAMPLE_LABELS) {
        const [created] = await rows<{ id: number }>(
          tx,
          `INSERT INTO rule_groups (workspace_id, owner_user_id, name, description, color, position, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, 0, clock_timestamp(), clock_timestamp())
           RETURNING id`,
          [workspaceId, user.id, label.name, label.description, label.color],
        );
        for (const [position, key] of label.presetKeys.entries()) {
          await rows(
            tx,
            `INSERT INTO rule_group_items (group_id, preset_id, position, created_at)
             VALUES ($1, $2, $3, clock_timestamp())`,
            [created.id, presetIds.get(key), position],
          );
        }
      }
      return true;
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') return false;
    throw error;
  }
}
