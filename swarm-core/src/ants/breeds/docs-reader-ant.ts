import { DocsAdapter } from '../../extractors/adapters/docs-adapter';
import { AntBreedDefinition, BreedExecutionContext, BreedRunResult } from './types';

const adapter = new DocsAdapter();

export class DocsReaderAnt implements AntBreedDefinition {
  id = 'docs_reader';
  terrains = ['docs', 'company', 'general-web'] as const;
  costClass = 'medium' as const;

  async run(context: BreedExecutionContext, units: number): Promise<BreedRunResult> {
    let processed = 0;
    let added = 0;
    const queryTerms = [context.request.query || '', ...(context.request.symbols || [])].filter(Boolean);

    while (processed < units && Date.now() < context.deadlineMs) {
      const item = context.frontier.pop(['docs', 'company']);
      if (!item) break;
      processed += 1;
      const html = await context.fetchHtml(item.url, 'http');
      if (!html) continue;
      const evidence = adapter.extract({
        url: item.url,
        html,
        terrain: item.terrainHint || 'docs',
        queryTerms,
        providerId: item.sourceProviderId,
        fetchedAt: Date.now(),
      });
      context.addEvidence(evidence);
      added += evidence.length;
    }

    return { processed, added };
  }
}
