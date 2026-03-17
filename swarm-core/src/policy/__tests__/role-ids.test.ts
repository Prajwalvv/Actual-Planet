import {
  ALL_ROLE_IDS,
  CONTROLLABLE_ROLE_IDS,
  POLICY_ACTIONS,
  isControllableRoleId,
  roleLocationId,
  terrainLocationId,
  providerLocationId,
  modelLocationId,
  ROLE_TERRAIN_PREFERENCES,
} from '../role-ids';

describe('role-ids', () => {
  it('ALL_ROLE_IDS contains the 7 expected roles', () => {
    expect(ALL_ROLE_IDS).toEqual([
      'search_bootstrap',
      'link_pathfinder',
      'news_reader',
      'forum_thread_reader',
      'docs_reader',
      'paper_abstract_reader',
      'source_verifier',
    ]);
  });

  it('CONTROLLABLE_ROLE_IDS excludes bootstrap and verifier', () => {
    expect(CONTROLLABLE_ROLE_IDS).toHaveLength(5);
    expect(CONTROLLABLE_ROLE_IDS).not.toContain('search_bootstrap');
    expect(CONTROLLABLE_ROLE_IDS).not.toContain('source_verifier');
  });

  it('POLICY_ACTIONS includes controllable roles + stop_explore', () => {
    expect(POLICY_ACTIONS).toHaveLength(6);
    expect(POLICY_ACTIONS[POLICY_ACTIONS.length - 1]).toBe('stop_explore');
  });

  it('isControllableRoleId validates correctly', () => {
    expect(isControllableRoleId('link_pathfinder')).toBe(true);
    expect(isControllableRoleId('news_reader')).toBe(true);
    expect(isControllableRoleId('search_bootstrap')).toBe(false);
    expect(isControllableRoleId('source_verifier')).toBe(false);
    expect(isControllableRoleId('stop_explore')).toBe(false);
    expect(isControllableRoleId('nonexistent')).toBe(false);
  });

  it('location ID helpers produce correct prefixed strings', () => {
    expect(roleLocationId('search_bootstrap')).toBe('ROLE:search_bootstrap');
    expect(terrainLocationId('news')).toBe('TERRAIN:news');
    expect(providerLocationId('duckduckgo_html')).toBe('PROVIDER:duckduckgo_html');
    expect(modelLocationId('discover')).toBe('MODEL:discover');
  });

  it('every controllable role has terrain preferences defined', () => {
    for (const roleId of CONTROLLABLE_ROLE_IDS) {
      expect(ROLE_TERRAIN_PREFERENCES[roleId]).toBeDefined();
      expect(ROLE_TERRAIN_PREFERENCES[roleId].length).toBeGreaterThan(0);
    }
  });
});
