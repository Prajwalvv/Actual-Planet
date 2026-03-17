import { AgentObservation, EvidenceCandidate } from '../agents/agent-types';
import { AgentModelRuntime } from '../agents/agent-model-runtime';
import { IAgentTraceCollector } from '../agents/agent-trace-collector';
import { SynthesizerAgent } from '../agents/synthesizer/synthesizer-agent';
import { buildSynthesizerFeatures, buildSynthesizerObservation } from '../agents/synthesizer/feature-builder';
import { EvidenceItem } from '../adaptive-types';

export async function rankEvidence(
  items: EvidenceItem[],
  limit: number = 20,
  context?: {
    agentRuntime?: AgentModelRuntime;
    agentTraceCollector?: IAgentTraceCollector;
    observation?: AgentObservation;
  }
): Promise<EvidenceItem[]> {
  // If no agent runtime or observation is provided, use the fallback heuristic
  if (!context?.agentRuntime || !context?.observation) {
    return fallbackRankEvidence(items, limit);
  }

  // Convert EvidenceItem to EvidenceCandidate
  const candidates: EvidenceCandidate[] = items.map(item => ({
    id: item.id,
    domain: item.domain,
    terrain: item.terrain,
    confidence: item.confidence,
    freshnessScore: item.freshnessScore,
    sourceScore: item.sourceScore,
    relevanceScore: item.relevanceScore,
    entityCount: item.entities.length,
    phraseCount: item.phrases.length,
    claimCount: item.claims.length,
    isCorroborated: (item.corroborationScore || 0) > 0.5,
    linkCount: item.discoveredLinks.length,
    sentimentScore: item.sentimentScore,
  }));

  const agent = new SynthesizerAgent(
    context.agentRuntime,
    `synthesizer:${Date.now().toString(36)}`,
    context.agentRuntime.isReady('synthesizer') ? undefined : 'heuristic'
  );

  const scored = await agent.scoreCandidates(context.observation, candidates);

  // Re-map back to EvidenceItem in the sorted order
  const idToItem = new Map(items.map(i => [i.id, i]));
  const sortedItems = scored.map(s => idToItem.get(s.candidate.id)!).filter(Boolean) as EvidenceItem[];

  // Record trace if collector is available
  if (context.agentTraceCollector && candidates.length > 0) {
    // Determine which candidates were "chosen" based on the limit
    const selectedIndices = Array.from({ length: Math.min(limit, candidates.length) }, (_, i) => scored[i].rank);
    
    // Build feature vectors for tracing
    const seenDomains = new Set(candidates.map(c => c.domain).filter(Boolean));
    const featureVectors = buildSynthesizerFeatures(context.observation, candidates, seenDomains);
    
    // Convert AgentObservation to standard object to ensure clean serialization
    const cleanObservation: Record<string, any> = { ...context.observation };
    
    context.agentTraceCollector.recordDecision(
      'synthesizer',
      cleanObservation as any,
      candidates,
      featureVectors,
      selectedIndices
    );
  }

  return sortedItems.slice(0, limit);
}

function fallbackRankEvidence(items: EvidenceItem[], limit: number = 20): EvidenceItem[] {
  return [...items]
    .sort((a, b) => {
      const aScore = a.confidence + a.freshnessScore + a.sourceScore + a.relevanceScore + (a.corroborationScore || 0);
      const bScore = b.confidence + b.freshnessScore + b.sourceScore + b.relevanceScore + (b.corroborationScore || 0);
      return bScore - aScore;
    })
    .slice(0, limit);
}
