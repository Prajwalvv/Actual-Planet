import { SwarmEngine } from './swarm-engine';

const QUERIES = [
  // ── FINANCE & MARKETS ──
  { q: 'nvidia earnings Q4 2025 analysis', s: ['NVDA'] },
  { q: 'tesla full self driving regulatory updates', s: ['TSLA'] },
  { q: 'microsoft AI capex spending outlook', s: ['MSFT'] },
  { q: 'apple vision pro sales demand trends', s: ['AAPL'] },
  { q: 'amazon AWS growth cloud market share', s: ['AMZN'] },
  { q: 'bitcoin ETF institutional flows 2026', s: [] },
  { q: 'semiconductor supply chain TSMC Samsung Intel outlook', s: ['TSM', 'INTC'] },
  { q: 'federal reserve interest rate decision impact', s: [] },
  { q: 'meta platforms metaverse revenue reality labs', s: ['META'] },
  { q: 'google gemini AI model competition openai', s: ['GOOGL'] },

  // ── TECHNOLOGY ──
  { q: 'rust programming language adoption in enterprise', s: [] },
  { q: 'quantum computing practical applications 2026', s: [] },
  { q: 'open source AI models llama mistral comparison', s: [] },
  { q: 'WebAssembly server side adoption trends', s: [] },
  { q: 'linux kernel 7 new features release', s: [] },
  { q: 'edge computing vs cloud computing tradeoffs', s: [] },
  { q: 'kubernetes alternatives lightweight container orchestration', s: [] },
  { q: 'browser engine competition chromium webkit servo', s: [] },
  { q: 'homomorphic encryption practical use cases', s: [] },
  { q: 'ARM architecture server market share growth', s: [] },

  // ── SCIENCE ──
  { q: 'CRISPR gene therapy clinical trial results 2026', s: [] },
  { q: 'nuclear fusion energy commercial timeline', s: [] },
  { q: 'James Webb telescope recent discoveries exoplanets', s: [] },
  { q: 'mRNA vaccine technology beyond covid applications', s: [] },
  { q: 'solid state battery technology commercialization', s: [] },
  { q: 'brain computer interface Neuralink competitors progress', s: [] },
  { q: 'carbon capture technology scalability economics', s: [] },
  { q: 'dark matter research latest evidence particles', s: [] },
  { q: 'artificial photosynthesis research breakthroughs', s: [] },
  { q: 'lab grown meat regulatory approval status', s: [] },

  // ── HEALTH & MEDICINE ──
  { q: 'alzheimer drug lecanemab long term efficacy data', s: [] },
  { q: 'GLP-1 weight loss drugs obesity epidemic impact', s: [] },
  { q: 'antibiotic resistance superbug crisis solutions', s: [] },
  { q: 'mental health crisis among teenagers social media', s: [] },
  { q: 'longevity research caloric restriction rapamycin', s: [] },

  // ── POLITICS & GEOPOLITICS ──
  { q: 'US China trade war tariffs semiconductor ban impact', s: [] },
  { q: 'EU AI Act regulation enforcement timeline', s: [] },
  { q: 'Ukraine conflict economic sanctions effectiveness', s: [] },
  { q: 'global south emerging economies growth outlook', s: [] },
  { q: 'space race commercial lunar missions artemis', s: [] },

  // ── CULTURE & SOCIETY ──
  { q: 'remote work trends return to office debate 2026', s: [] },
  { q: 'AI generated art copyright legal battles', s: [] },
  { q: 'social media regulation Section 230 reform', s: [] },
  { q: 'electric vehicle adoption rate charging infrastructure', s: [] },
  { q: 'housing affordability crisis solutions worldwide', s: [] },

  // ── SPORTS ──
  { q: 'FIFA World Cup 2026 hosting cities preparations', s: [] },
  { q: 'Formula 1 2026 regulation changes engine rules', s: [] },
  { q: 'NBA salary cap collective bargaining agreement', s: [] },
  { q: 'Olympics 2028 Los Angeles venue construction update', s: [] },
  { q: 'cricket IPL franchise valuations business model', s: [] },

  // ── EDUCATION & RESEARCH ──
  { q: 'AI tutoring personalized education effectiveness research', s: [] },
  { q: 'university enrollment decline demographic cliff impact', s: [] },
  { q: 'peer review crisis scientific publishing reform', s: [] },
  { q: 'coding bootcamp outcomes employment rate analysis', s: [] },
  { q: 'open access journals impact factor academic publishing', s: [] },

  // ── ENERGY & ENVIRONMENT ──
  { q: 'solar panel efficiency record breaking research', s: [] },
  { q: 'global warming 1.5 degree target feasibility assessment', s: [] },
  { q: 'hydrogen fuel cell vehicle infrastructure progress', s: [] },
  { q: 'deep sea mining environmental impact debate', s: [] },
  { q: 'wildfire prediction AI satellite monitoring systems', s: [] },

  // ── RANDOM DIVERSE ──
  { q: 'best mechanical keyboard switches for programming', s: [] },
  { q: 'sourdough bread fermentation science techniques', s: [] },
  { q: 'history of the internet ARPANET to modern web', s: [] },
  { q: 'vertical farming economics scalability urban agriculture', s: [] },
  { q: 'sleep science circadian rhythm optimization tips', s: [] },
];

async function run() {
  console.log(`🚀 MASSIVE TRACE COLLECTION: ${QUERIES.length} diverse queries`);
  console.log(`   Expected time: ~${Math.ceil(QUERIES.length * 28 / 60)} minutes\n`);

  const engine = new SwarmEngine();
  await engine.start();

  let totalEvidence = 0;
  let successCount = 0;
  const startTime = Date.now();

  for (let i = 0; i < QUERIES.length; i++) {
    const x = QUERIES[i];
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    process.stdout.write(`[${String(i + 1).padStart(2)}/${QUERIES.length}] ${elapsed}s | ${x.q.slice(0, 55).padEnd(55)} `);

    try {
      const result = await engine.executeQuery({
        query: x.q,
        symbols: x.s,
        depth: 'quick',
        terrainHints: ['news', 'forum', 'docs', 'academic'],
        modelId: 'gpt-4o-mini',
        timeoutSec: 30,
      }, {
        queuePosition: 0,
        queueWaitMs: 0,
        autoStarted: false,
        restartedForModel: false,
        coldStartMs: 0,
      });

      totalEvidence += result.evidence.length;
      if (result.evidence.length > 0) successCount++;
      console.log(`ev=${result.evidence.length} cov=${(result.queryMeta.coverage.coverageRatio * 100).toFixed(0)}%`);
    } catch (err: any) {
      console.log(`ERROR: ${err.message?.slice(0, 60)}`);
    }
  }

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ DONE in ${totalSec}s`);
  console.log(`   Queries: ${QUERIES.length} (${successCount} with evidence)`);
  console.log(`   Total evidence: ${totalEvidence}`);
  console.log(`   Traces: ${process.env.SWARM_AGENT_TRACE_DIR}`);

  await engine.stop();
  process.exit(0);
}

run();
