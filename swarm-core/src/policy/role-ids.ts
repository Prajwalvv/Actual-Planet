import { TerrainType } from '../adaptive-types';

export const ALL_ROLE_IDS = [
  'search_bootstrap',
  'link_pathfinder',
  'news_reader',
  'forum_thread_reader',
  'docs_reader',
  'paper_abstract_reader',
  'source_verifier',
] as const;

export type RoleId = typeof ALL_ROLE_IDS[number];

export const CONTROLLABLE_ROLE_IDS = [
  'link_pathfinder',
  'news_reader',
  'forum_thread_reader',
  'docs_reader',
  'paper_abstract_reader',
] as const;

export type ControllableRoleId = typeof CONTROLLABLE_ROLE_IDS[number];
export type PolicyActionRoleId = ControllableRoleId | 'stop_explore';

export const POLICY_ACTIONS = [...CONTROLLABLE_ROLE_IDS, 'stop_explore'] as const;

export const ROLE_TERRAIN_PREFERENCES: Record<ControllableRoleId, TerrainType[]> = {
  link_pathfinder: ['general-web', 'news', 'docs', 'company', 'forum', 'social-signal', 'academic'],
  news_reader: ['news', 'company', 'general-web'],
  forum_thread_reader: ['forum', 'social-signal', 'general-web'],
  docs_reader: ['docs', 'company', 'general-web'],
  paper_abstract_reader: ['academic'],
};

export function isControllableRoleId(value: string): value is ControllableRoleId {
  return (CONTROLLABLE_ROLE_IDS as readonly string[]).includes(value);
}

export function roleLocationId(roleId: RoleId): string {
  return `ROLE:${roleId}`;
}

export function terrainLocationId(terrain: TerrainType): string {
  return `TERRAIN:${terrain}`;
}

export function providerLocationId(providerId: string): string {
  return `PROVIDER:${providerId}`;
}

export function modelLocationId(modelId: string): string {
  return `MODEL:${modelId}`;
}
