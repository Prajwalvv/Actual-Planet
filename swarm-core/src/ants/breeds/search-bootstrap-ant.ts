import { AntBreedDefinition, BreedExecutionContext, BreedRunResult } from './types';

export class SearchBootstrapAnt implements AntBreedDefinition {
  id = 'search_bootstrap';
  terrains = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;
  costClass = 'cheap' as const;

  async run(context: BreedExecutionContext, _units: number): Promise<BreedRunResult> {
    const found = await context.providers.discover({
      query: context.request.query || '',
      symbols: context.request.symbols || [],
      terrains: context.plan.terrains.map((t) => t.terrain),
    }, context.plan.providerPlan, context.deadlineMs);

    let added = 0;
    for (const candidate of found) {
      const ok = await context.enqueueUrl({
        url: candidate.url,
        sourceProviderId: candidate.sourceProviderId,
        terrainHint: candidate.terrainHint,
        priority: candidate.confidence,
        title: candidate.title,
        snippet: candidate.snippet,
      });
      if (ok) added += 1;
    }

    context.emit({
      type: 'sources_discovered',
      data: {
        added,
        totalCandidates: found.length,
        sample: found.slice(0, 8),
      },
    });

    return { processed: found.length, added };
  }
}
