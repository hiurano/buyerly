import { Arg, Ctx, Mutation, Resolver } from 'type-graphql';
import { setEntityBudget, setEntityDelivery } from '../../../meta/delivery.ts';
import { mutated, type GraphQLContext } from '../../context.ts';
import { inputSchema } from '../../input.ts';
import { DeliveryPayload, type Payload } from '../../payloads.ts';
import { JSONScalar } from '../../scalars.ts';

// Manual delivery and budget changes on one Meta entity
// (api/routers/delivery.py, #611 stage 4); the work is in meta/delivery.ts.

// EntityDeliveryRequest
const DELIVERY = inputSchema<{ account_id: string; status: 'ACTIVE' | 'PAUSED' }>({
  type: 'object',
  additionalProperties: false,
  required: ['account_id', 'status'],
  properties: {
    account_id: { type: 'string', minLength: 1, maxLength: 60 },
    status: { enum: ['ACTIVE', 'PAUSED'] },
  },
});

// EntityBudgetRequest
const BUDGET = inputSchema<{ account_id: string; daily_budget: number }>({
  type: 'object',
  additionalProperties: false,
  required: ['account_id', 'daily_budget'],
  properties: {
    account_id: { type: 'string', minLength: 1, maxLength: 60 },
    daily_budget: { type: 'number', minimum: 1.0, maximum: 1_000_000.0 },
  },
});

// The route's path: level = Path(pattern="^(campaign|adset|ad)$"), entity_id = Path(min_length=1, max_length=64),
// checked after the body, in the handler's argument order.
const LEVEL = inputSchema<{ level: string }>({
  type: 'object',
  properties: { level: { type: 'string', pattern: '^(campaign|adset|ad)$' } },
});
const ENTITY_ID = inputSchema<{ entity_id: string }>({
  type: 'object',
  properties: { entity_id: { type: 'string', minLength: 1, maxLength: 64 } },
});

function path(level: string, entityId: string): void {
  LEVEL.parse({ level });
  ENTITY_ID.parse({ entity_id: entityId });
}

@Resolver()
export class DeliveryResolver {
  @Mutation(() => DeliveryPayload, { nullable: true, description: 'Turns a campaign, ad set or ad on or off in Meta.' })
  async entityDeliveryUpdate(
    @Arg('level', () => String) level: string,
    @Arg('entityId', () => String) entityId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const request = DELIVERY.parse(input);
    path(level, entityId);
    return mutated(context, DeliveryPayload, await setEntityDelivery(context.app, context.user, level, entityId, request));
  }

  @Mutation(() => DeliveryPayload, { nullable: true, description: "Changes a campaign's or ad set's budget in Meta." })
  async entityBudgetUpdate(
    @Arg('level', () => String) level: string,
    @Arg('entityId', () => String) entityId: string,
    @Arg('input', () => JSONScalar) input: unknown,
    @Ctx() context: GraphQLContext,
  ): Promise<Payload> {
    const request = BUDGET.parse(input);
    path(level, entityId);
    return mutated(context, DeliveryPayload, await setEntityBudget(context.app, context.user, level, entityId, request));
  }
}
