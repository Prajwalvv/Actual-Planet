import { AntBreedDefinition, BreedExecutionContext, BreedRunResult } from './types';
import { normalizeTopic } from '../../nlp/topic-normalizer';
import { ValidatorAgent } from '../../agents/validator/validator-agent';
import { buildValidatorFeatures } from '../../agents/validator/feature-builder';
import { ClaimCandidate } from '../../agents/agent-types';

export class SourceVerifierAnt implements AntBreedDefinition {
  id = 'source_verifier';
  terrains = ['news', 'forum', 'docs', 'academic', 'company', 'general-web', 'social-signal'] as const;
  costClass = 'cheap' as const;

  async run(context: BreedExecutionContext, _units: number): Promise<BreedRunResult> {
    const evidence = context.overlay.getEvidence();
    if (evidence.length === 0) {
      return { processed: 0, added: 0 };
    }

    // 1. Setup Validator Agent
    const agent = new ValidatorAgent(
      context.agentRuntime || ({} as any), // Fallback if runtime missing
      `validator:${Date.now().toString(36)}`,
      context.agentRuntime?.isReady('validator') ? undefined : 'heuristic'
    );

    // 2. Build Topic Clusters
    const byTopic = new Map<string, { domains: Set<string>; evidenceIds: string[] }>();
    for (const item of evidence) {
      for (const topic of [...item.entities, ...item.phrases]) {
        const normalized = normalizeTopic(topic);
        if (!normalized) continue;
        const current = byTopic.get(normalized) || { domains: new Set<string>(), evidenceIds: [] };
        current.domains.add(item.domain);
        current.evidenceIds.push(item.id);
        byTopic.set(normalized, current);
      }
    }

    // 3. Extract Claim Candidates
    const candidates: ClaimCandidate[] = [];
    const itemByClaimMap = new Map<ClaimCandidate, typeof evidence[0]>();

    for (const item of evidence) {
      // Calculate standard corroboration first
      let bestCorroboration = 0;
      for (const topic of [...item.entities, ...item.phrases]) {
        const normalized = normalizeTopic(topic);
        if (!normalized) continue;
        const state = byTopic.get(normalized);
        if (!state) continue;
        const score = Math.min(1, state.domains.size * 0.22 + state.evidenceIds.length * 0.08);
        bestCorroboration = Math.max(bestCorroboration, score);
      }
      
      // We still assign corroborationScore directly for backward compatibility
      item.corroborationScore = Number(bestCorroboration.toFixed(3));

      // Build claim candidates for the agent
      for (const claimText of item.claims) {
        // Find how many other sources mention topics in this claim
        let mentionCount = 1;
        for (const topic of item.entities) {
          if (claimText.toLowerCase().includes(topic.toLowerCase())) {
            const normalized = normalizeTopic(topic);
            const state = byTopic.get(normalized || '');
            if (state) {
              mentionCount = Math.max(mentionCount, state.domains.size);
            }
          }
        }

        const claimCandidate: ClaimCandidate = {
          claim: claimText,
          sourceEvidenceId: item.id,
          sourceDomain: item.domain,
          sourceTerrain: item.terrain,
          sourceConfidence: item.confidence,
          sourceCredibility: item.sourceScore,
          mentionCount,
          hasSpecifics: /\d|%|\$|increase|decrease|million|billion/i.test(claimText),
          isVerifiable: claimText.split(' ').length > 4 && !/i think|maybe|probably|opinion/i.test(claimText),
          complexity: claimText.split(' ').length,
        };
        candidates.push(claimCandidate);
        itemByClaimMap.set(claimCandidate, item);
      }
    }

    if (candidates.length === 0) {
      return { processed: evidence.length, added: 0 };
    }

    // 4. Build Observation Context
    const coverage = context.overlay.getSourceCoverage();
    const observation = {
      queryLengthNorm: Math.min(1, (context.request.query?.length || 0) / 200),
      symbolCount: context.request.symbols?.length || 0,
      terrainOneHot: [0, 0, 0, 0, 0, 0, 0], // Fast simplification
      depthOneHot: context.request.depth === 'deep' ? [0, 0, 1] : context.request.depth === 'standard' ? [0, 1, 0] : [1, 0, 0],
      timeBudgetRemaining: Math.max(0, 1 - (context.deadlineMs - Date.now()) / context.deadlineMs),
      coverageRatio: Math.min(1, coverage.totalDomains / 5),
      frontierSizeNorm: Math.min(1, context.frontier.size() / 200),
      evidenceCountNorm: Math.min(1, evidence.length / 100),
      sourceDiversityNorm: Math.min(1, coverage.totalDomains / 20),
      trailStrength: 0.5,
      interestStrength: 0.5,
      deadTrailStrength: 0.1,
      stepProgress: 0.5,
      blockedRatioNorm: 0.1,
      usefulnessScore: 0.5,
    };

    // 5. Score claims with ValidatorAgent
    const scoredClaims = await agent.scoreCandidates(observation, candidates);

    // 6. Record Trace
    if (context.agentTraceCollector && candidates.length > 0) {
      // Pick top 20% to represent "selected" items for verification priority
      const selectedCount = Math.max(1, Math.floor(candidates.length * 0.2));
      const selectedIndices = Array.from({ length: selectedCount }, (_, i) => scoredClaims[i].rank);
      
      const verifiedDomains = new Set(candidates.map(c => c.sourceDomain));
      const featureVectors = buildValidatorFeatures(observation as any, candidates, verifiedDomains);
      
      const cleanObservation: Record<string, any> = { ...observation };

      context.agentTraceCollector.recordDecision(
        'validator',
        cleanObservation as any,
        candidates,
        featureVectors,
        selectedIndices
      );
    }

    // 7. Apply validator boosts back to EvidenceItems
    // Top claims boost their source evidence corroboration score
    const topClaims = scoredClaims.slice(0, Math.max(1, Math.floor(scoredClaims.length * 0.3)));
    for (const scored of topClaims) {
      const item = itemByClaimMap.get(scored.candidate);
      if (item && item.corroborationScore !== undefined) {
        // Boost corroboration score based on validator priority
        item.corroborationScore = Math.min(1.0, item.corroborationScore + (scored.score * 0.1));
      }
    }

    return { processed: evidence.length, added: 0 };
  }
}
