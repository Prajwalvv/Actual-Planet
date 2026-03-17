import { QueryExecutionPlan } from '../adaptive-types';
import { PolicyAction, PolicyGuardResult } from './policy-types';
import { ControllableRoleId, CONTROLLABLE_ROLE_IDS } from './role-ids';

function planHasRole(plan: QueryExecutionPlan, roleId: ControllableRoleId): boolean {
  return Boolean(plan.breedPlan.find((breed) => breed.breedId === roleId && breed.count > 0));
}

export function computeAvailableRoles(
  plan: QueryExecutionPlan,
  frontierSize: number,
  evidenceCount: number,
): ControllableRoleId[] {
  const roles: ControllableRoleId[] = [];

  for (const roleId of CONTROLLABLE_ROLE_IDS) {
    if (!planHasRole(plan, roleId)) continue;
    if (roleId === 'link_pathfinder') {
      if (evidenceCount > 0) roles.push(roleId);
      continue;
    }
    if (frontierSize > 0) roles.push(roleId);
  }

  return roles;
}

export function validateModelAction(
  action: PolicyAction | null,
  availableRoles: ControllableRoleId[],
  confidenceFloor: number,
): PolicyGuardResult {
  if (!action) return { ok: false, reason: 'gru_unavailable' };
  if (action.roleId === 'stop_explore') {
    return {
      ok: true,
      action: {
        ...action,
        units: 0,
      },
    };
  }
  if (!availableRoles.includes(action.roleId)) {
    return { ok: false, reason: 'invalid_role_for_state' };
  }
  if (!Number.isFinite(action.units) || action.units < 1 || action.units > 2) {
    return { ok: false, reason: 'invalid_units' };
  }
  if (!Number.isFinite(action.confidence) || action.confidence < confidenceFloor) {
    return { ok: false, reason: 'confidence_below_floor' };
  }
  return {
    ok: true,
    action: {
      ...action,
      units: Math.max(1, Math.min(2, Math.round(action.units))),
    },
  };
}
