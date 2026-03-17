import { QueryExecutionPlan, TerrainType } from '../adaptive-types';
import { IPheromoneSpace, Location, PheromoneDeposit, PheromoneType } from '../types';
import { PolicyAction, DecisionOutcome, PheromoneBucketSummary, PheromoneContextSummary } from './policy-types';
import { ALL_ROLE_IDS, RoleId, modelLocationId, providerLocationId, roleLocationId, terrainLocationId } from './role-ids';

async function summarizeLocation(space: IPheromoneSpace, locationId: string): Promise<PheromoneBucketSummary> {
  const snapshot = await space.read(locationId);
  const dominant = snapshot.signals
    .slice()
    .sort((a, b) => b.strength - a.strength)[0];

  return {
    locationId,
    concentration: Number(snapshot.totalConcentration.toFixed(4)),
    signalDiversity: snapshot.signalDiversity,
    dominantType: dominant?.type ?? null,
  };
}

export async function summarizePheromoneContext(
  space: IPheromoneSpace,
  input: {
    rootLocation: string;
    modelId: string;
    providerIds: string[];
  },
): Promise<PheromoneContextSummary> {
  const root = await summarizeLocation(space, input.rootLocation);
  const model = await summarizeLocation(space, modelLocationId(input.modelId));

  const roleEntries = await Promise.all(
    ALL_ROLE_IDS.map(async (roleId) => [roleId, await summarizeLocation(space, roleLocationId(roleId))] as const),
  );
  const terrainEntries = await Promise.all(
    (['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as TerrainType[])
      .map(async (terrain) => [terrain, await summarizeLocation(space, terrainLocationId(terrain))] as const),
  );
  const providerEntries = await Promise.all(
    input.providerIds.map(async (providerId) => [providerId, await summarizeLocation(space, providerLocationId(providerId))] as const),
  );

  return {
    root,
    roles: Object.fromEntries(roleEntries) as Record<RoleId, PheromoneBucketSummary>,
    terrains: Object.fromEntries(terrainEntries) as Record<TerrainType, PheromoneBucketSummary>,
    providers: Object.fromEntries(providerEntries),
    model,
  };
}

export async function ensurePolicyLocations(
  space: IPheromoneSpace,
  input: {
    rootLocation: string;
    modelId: string;
    plan: QueryExecutionPlan;
  },
): Promise<void> {
  const locations: Location[] = [
    { id: modelLocationId(input.modelId), type: 'category' as const, parents: [input.rootLocation] },
    ...ALL_ROLE_IDS.map((roleId) => ({ id: roleLocationId(roleId), type: 'category' as const, parents: [input.rootLocation] as string[] })),
    ...input.plan.providerPlan.map((entry) => ({ id: providerLocationId(entry.providerId), type: 'category' as const, parents: [input.rootLocation] as string[] })),
    ...input.plan.terrains.map((entry) => ({ id: terrainLocationId(entry.terrain), type: 'category' as const, parents: [input.rootLocation] as string[] })),
  ];

  await Promise.all(locations.map((location) => space.registerLocation(location)));
}

function buildDeposits(
  action: PolicyAction,
  outcome: DecisionOutcome,
  input: {
    modelId: string;
    traceId: string;
    stepIndex: number;
  },
): PheromoneDeposit[] {
  if (action.roleId === 'stop_explore') return [];

  const now = Date.now();
  const sourceAntId = `policy:${input.traceId}:${input.stepIndex}`;
  const sourceColony = 'policy_controller';
  const locations = [
    roleLocationId(action.roleId),
    modelLocationId(input.modelId),
    ...outcome.terrainDeltaIds.map((terrain) => terrainLocationId(terrain)),
    ...outcome.providerDeltaIds.map((providerId) => providerLocationId(providerId)),
  ];

  const uniqueLocations = [...new Set(locations)];
  const deposits: PheromoneDeposit[] = [];

  const pushType = (type: PheromoneType, strength: number) => {
    for (const locationId of uniqueLocations) {
      deposits.push({
        type,
        locationId,
        strength,
        sourceAntId,
        sourceColony,
        timestamp: now,
      });
    }
  };

  if (outcome.useful) {
    pushType(PheromoneType.TRAIL, Math.min(1, 0.22 + outcome.evidenceDelta * 0.08 + outcome.coverageDelta * 0.4));
    pushType(PheromoneType.INTEREST, Math.min(1, 0.18 + outcome.usefulnessDelta * 0.5 + outcome.added * 0.04));
  } else {
    pushType(PheromoneType.DEAD_TRAIL, 0.18);
  }

  if (outcome.processed > 0 && outcome.added === 0) {
    pushType(PheromoneType.SATURATED, Math.min(0.7, 0.16 + outcome.processed * 0.04));
  }

  if (outcome.blockedDelta > 0) {
    pushType(PheromoneType.REBALANCE, Math.min(0.8, 0.18 + outcome.blockedDelta * 0.06));
  }

  return deposits;
}

export async function recordPolicyOutcomePheromones(
  space: IPheromoneSpace,
  action: PolicyAction,
  outcome: DecisionOutcome,
  input: {
    modelId: string;
    traceId: string;
    stepIndex: number;
  },
): Promise<void> {
  const deposits = buildDeposits(action, outcome, input);
  for (const deposit of deposits) {
    await space.deposit(deposit);
  }
}
