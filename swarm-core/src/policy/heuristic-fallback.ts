import { QueryExecutionPlan } from '../adaptive-types';
import { PolicyAction } from './policy-types';
import { ControllableRoleId, CONTROLLABLE_ROLE_IDS, PolicyActionRoleId, RoleId, isControllableRoleId } from './role-ids';

export interface HeuristicPolicyState {
  cursor: number;
}

export function createHeuristicPolicyState(): HeuristicPolicyState {
  return { cursor: 0 };
}

export function planUnitsForRole(plan: QueryExecutionPlan, roleId: ControllableRoleId): number {
  const entry = plan.breedPlan.find((breed) => breed.breedId === roleId);
  return Math.max(1, Math.min(2, entry?.count || 1));
}

export function heuristicPolicyAction(
  plan: QueryExecutionPlan,
  availableRoles: RoleId[],
  state: HeuristicPolicyState,
): PolicyAction {
  const ordered = CONTROLLABLE_ROLE_IDS.filter((roleId) => availableRoles.includes(roleId));
  if (ordered.length === 0) {
    return {
      roleId: 'stop_explore',
      units: 0,
      confidence: 1,
      source: 'heuristic',
      reason: 'no_valid_roles_remaining',
    };
  }

  const picked = ordered[state.cursor % ordered.length];
  state.cursor = (state.cursor + 1) % ordered.length;

  return {
    roleId: picked,
    units: planUnitsForRole(plan, picked),
    confidence: 0.9,
    source: 'heuristic',
    reason: 'heuristic_round_robin',
  };
}

export function fallbackActionFromReason(
  reason: string,
  baseAction: PolicyAction,
): PolicyAction {
  return {
    ...baseAction,
    source: baseAction.source === 'heuristic' ? 'heuristic' : 'fallback',
    reason,
  };
}

export function normalizeRoleChoice(value: PolicyActionRoleId): PolicyActionRoleId {
  if (value === 'stop_explore') return value;
  return isControllableRoleId(value) ? value : 'stop_explore';
}
