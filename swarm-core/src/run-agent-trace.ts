import { SwarmEngine } from './swarm-engine';

async function run() {
  console.log('🚀 Starting standalone trace collection run...');
  const engine = new SwarmEngine();
  await engine.start();
  
  try {
    const requests = [
      {
        query: 'Nvidia latest earnings report analysis',
        symbols: ['NVDA'],
        depth: 'quick' as const,
        terrainHints: ['news', 'academic'] as const,
      },
      {
        query: 'Tesla full self driving regulatory updates 2026',
        symbols: ['TSLA'],
        depth: 'standard' as const,
        terrainHints: ['news', 'forum'] as const,
      },
      {
        query: 'OpenAI enterprise adoption and pricing trends',
        symbols: [],
        depth: 'standard' as const,
        terrainHints: ['news', 'docs'] as const,
      },
      {
        query: 'Bitcoin ETF flows and institutional allocation trends',
        symbols: ['BTC'],
        depth: 'quick' as const,
        terrainHints: ['news', 'forum'] as const,
      },
      {
        query: 'Semiconductor supply chain capex outlook TSMC Samsung Intel',
        symbols: ['TSM', 'INTC'],
        depth: 'deep' as const,
        terrainHints: ['news', 'academic', 'docs'] as const,
      },
    ];

    let totalEvidence = 0;
    for (const [idx, req] of requests.entries()) {
      console.log(`\n🔎 [${idx + 1}/${requests.length}] ${req.query}`);
      const result = await engine.executeQuery({
        query: req.query,
        symbols: req.symbols,
        depth: req.depth,
        terrainHints: [...req.terrainHints],
        modelId: 'gpt-4o-mini',
        timeoutSec: req.depth === 'deep' ? 45 : 30,
      }, {
        queuePosition: 0,
        queueWaitMs: 0,
        autoStarted: false,
        restartedForModel: false,
        coldStartMs: 0,
      });
      totalEvidence += result.evidence.length;
      console.log(`   evidence=${result.evidence.length} coverage=${(result.queryMeta.coverage.coverageRatio * 100).toFixed(1)}%`);
    }

    console.log('\n✅ Finished batch query execution');
    console.log('Total evidence items:', totalEvidence);
    console.log('Traces saved to:', process.env.SWARM_AGENT_TRACE_DIR);
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await engine.stop();
    process.exit(0);
  }
}

run();
