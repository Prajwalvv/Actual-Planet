import { DiscoveryCandidate, DiscoveryInput, DiscoveryProviderKind, ProviderBudget } from '../adaptive-types';

export interface DiscoveryProvider {
  id: string;
  kind: DiscoveryProviderKind;
  costClass: 'cheap' | 'medium' | 'expensive';
  supportsQuery: boolean;
  supportsDomainBootstrap: boolean;
  supportsPagination: boolean;
  discover(input: DiscoveryInput, budget: ProviderBudget): Promise<DiscoveryCandidate[]>;
}
