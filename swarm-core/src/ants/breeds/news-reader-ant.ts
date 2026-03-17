import { NewsAdapter } from '../../extractors/adapters/news-adapter';
import { AntBreedDefinition, BreedExecutionContext, BreedRunResult } from './types';

const adapter = new NewsAdapter();

export class NewsReaderAnt implements AntBreedDefinition {
  id = 'news_reader';
  terrains = ['news', 'general-web', 'company'] as const;
  costClass = 'medium' as const;

  async run(context: BreedExecutionContext, units: number): Promise<BreedRunResult> {
    let processed = 0;
    let added = 0;
    const queryTerms = [context.request.query || '', ...(context.request.symbols || [])].filter(Boolean);

    while (processed < units && Date.now() < context.deadlineMs) {
      const item = context.frontier.pop(['news', 'company', 'general-web']);
      if (!item) break;
      processed += 1;
      const html = await context.fetchHtml(item.url, item.terrainHint === 'general-web' ? 'browser' : 'http');
      if (!html) continue;
      const evidence = adapter.extract({
        url: item.url,
        html,
        terrain: item.terrainHint || 'news',
        queryTerms,
        providerId: item.sourceProviderId,
        fetchedAt: Date.now(),
      });
      context.addEvidence(evidence);
      added += evidence.length;
      for (const next of evidence.flatMap((entry) => entry.discoveredLinks.slice(0, 4))) {
        await context.enqueueUrl({ url: next, sourceProviderId: this.id, priority: 0.48, depth: item.depth + 1, discoveredFrom: item.url });
      }
    }

    return { processed, added };
  }
}
