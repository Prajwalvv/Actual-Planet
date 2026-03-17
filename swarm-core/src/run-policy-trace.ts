import { SwarmEngine } from './swarm-engine';
import path from 'path';

/**
 * GRU Queen Policy Trace Collection
 * 
 * Runs diverse queries at different depths to collect policy decision traces.
 * These traces capture the Queen's strategic choices: which providers to query,
 * how many ants to spawn, when to explore vs synthesize, etc.
 * 
 * Enable with: SWARM_POLICY_TRACE=1
 */

const POLICY_QUERIES: { query: string; depth: 'quick' | 'standard' | 'deep' }[] = [
  // Quick depth — tests fast decision-making
  { query: "What is the current price of Bitcoin?", depth: 'quick' },
  { query: "Who won the latest Super Bowl?", depth: 'quick' },
  { query: "What is the weather in Tokyo today?", depth: 'quick' },
  { query: "Define machine learning", depth: 'quick' },
  { query: "What is the population of India?", depth: 'quick' },
  { query: "Latest SpaceX launch date", depth: 'quick' },
  { query: "Current US president", depth: 'quick' },
  { query: "What is CRISPR?", depth: 'quick' },
  { query: "Python vs JavaScript performance", depth: 'quick' },
  { query: "Top rated movies 2025", depth: 'quick' },
  { query: "How does mRNA vaccine work?", depth: 'quick' },
  { query: "Rust programming language benefits", depth: 'quick' },
  { query: "Best electric cars 2026", depth: 'quick' },
  { query: "What is quantum entanglement?", depth: 'quick' },
  { query: "Latest AI research breakthroughs", depth: 'quick' },

  // Standard depth — balanced exploration
  { query: "Is remote work more productive than office work?", depth: 'standard' },
  { query: "What are the health effects of intermittent fasting?", depth: 'standard' },
  { query: "How does climate change affect ocean currents?", depth: 'standard' },
  { query: "Compare React vs Vue vs Svelte for web development", depth: 'standard' },
  { query: "What caused the 2008 financial crisis?", depth: 'standard' },
  { query: "How do autonomous vehicles navigate complex traffic?", depth: 'standard' },
  { query: "What are the environmental impacts of lithium mining?", depth: 'standard' },
  { query: "How does CRISPR gene editing work and what are the risks?", depth: 'standard' },
  { query: "What is the current state of nuclear fusion research?", depth: 'standard' },
  { query: "How do large language models actually work?", depth: 'standard' },
  { query: "What are the pros and cons of universal basic income?", depth: 'standard' },
  { query: "How effective are carbon capture technologies?", depth: 'standard' },
  { query: "What is the microbiome and how does it affect health?", depth: 'standard' },
  { query: "How do central bank digital currencies work?", depth: 'standard' },
  { query: "What are the latest developments in solid-state batteries?", depth: 'standard' },
  { query: "How does neuroplasticity work in the adult brain?", depth: 'standard' },
  { query: "What is the impact of microplastics on marine ecosystems?", depth: 'standard' },
  { query: "How do mRNA vaccines compare to traditional vaccines?", depth: 'standard' },
  { query: "What are the security implications of quantum computing?", depth: 'standard' },
  { query: "How does regenerative agriculture differ from conventional farming?", depth: 'standard' },
  { query: "What are the causes of the global semiconductor shortage?", depth: 'standard' },
  { query: "How do heat pumps compare to gas heating systems?", depth: 'standard' },
  { query: "What is the evidence for and against dark matter?", depth: 'standard' },
  { query: "How effective is cognitive behavioral therapy?", depth: 'standard' },
  { query: "What are the risks and benefits of nuclear power?", depth: 'standard' },
  { query: "How do distributed systems handle consensus?", depth: 'standard' },
  { query: "What are the economic effects of immigration?", depth: 'standard' },
  { query: "How does brain-computer interface technology work?", depth: 'standard' },
  { query: "What is the current state of hydrogen fuel cell technology?", depth: 'standard' },
  { query: "How do psychedelics affect mental health treatment?", depth: 'standard' },

  // Deep depth — extensive multi-source research
  { query: "Comprehensive analysis of global AI regulation approaches", depth: 'deep' },
  { query: "Compare all major approaches to solving climate change", depth: 'deep' },
  { query: "Full analysis of cryptocurrency regulation worldwide", depth: 'deep' },
  { query: "Deep dive into the causes and solutions for antibiotic resistance", depth: 'deep' },
  { query: "Comprehensive review of longevity science and anti-aging research", depth: 'deep' },
  { query: "Full comparison of global healthcare systems and outcomes", depth: 'deep' },
  { query: "Deep analysis of the geopolitics of rare earth minerals", depth: 'deep' },
  { query: "Comprehensive review of space colonization feasibility", depth: 'deep' },
  { query: "Full analysis of global food security challenges and solutions", depth: 'deep' },
  { query: "Deep dive into the economics of renewable energy transition", depth: 'deep' },
  { query: "Comprehensive comparison of programming paradigms and their use cases", depth: 'deep' },
  { query: "Full analysis of ocean acidification causes and effects", depth: 'deep' },
  { query: "Deep review of the history and future of artificial intelligence", depth: 'deep' },
  { query: "Comprehensive analysis of global water scarcity solutions", depth: 'deep' },
  { query: "Full comparison of electric vehicle battery technologies", depth: 'deep' },
];

async function main() {
  console.log(`👑 Starting GRU Queen Policy Trace Collection`);
  console.log(`📊 Running ${POLICY_QUERIES.length} queries across quick/standard/deep depths\n`);

  const quickCount = POLICY_QUERIES.filter(q => q.depth === 'quick').length;
  const standardCount = POLICY_QUERIES.filter(q => q.depth === 'standard').length;
  const deepCount = POLICY_QUERIES.filter(q => q.depth === 'deep').length;
  console.log(`  Quick: ${quickCount} | Standard: ${standardCount} | Deep: ${deepCount}\n`);

  const engine = new SwarmEngine({
    id: 'policy-trace-engine',
  });

  await engine.start();

  let totalEvidence = 0;
  let successCount = 0;

  for (let i = 0; i < POLICY_QUERIES.length; i++) {
    const { query, depth } = POLICY_QUERIES[i];
    const timeoutSec = depth === 'quick' ? 15 : depth === 'standard' ? 30 : 60;
    console.log(`\n[${i + 1}/${POLICY_QUERIES.length}] [${depth}] "${query}"`);

    try {
      const result = await engine.executeQuery(
        {
          query,
          depth,
          modelId: 'default',
          timeoutSec,
        },
        {
          queuePosition: i,
          queueWaitMs: 0,
          autoStarted: false,
          restartedForModel: false,
          coldStartMs: 0,
          timeoutRequestedSec: timeoutSec,
        }
      );

      const evidenceCount = result.evidence?.length || 0;
      totalEvidence += evidenceCount;
      successCount++;

      console.log(`  ✓ Evidence: ${evidenceCount}`);

      // Shorter delay for quick queries, longer for deep
      const delay = depth === 'quick' ? 1000 : depth === 'standard' ? 2000 : 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
    }
  }

  await engine.stop();

  console.log(`\n👑 Policy Trace Collection Complete`);
  console.log(`📊 Successful: ${successCount}/${POLICY_QUERIES.length}`);
  console.log(`📊 Total Evidence: ${totalEvidence}`);
  console.log(`📁 Policy traces saved to: runtime-artifacts/policy-traces/`);
  console.log(`\nNext steps:`);
  console.log(`  1. Inspect: python3 ml/dataset.py --trace-dir runtime-artifacts/policy-traces`);
  console.log(`  2. Train:   python3 ml/train_imitation.py --trace-dir runtime-artifacts/policy-traces --output-dir ml/artifacts/imitation-v1 --epochs 40 --hidden-size 96`);
  console.log(`  3. Export:  python3 ml/export_onnx.py --checkpoint ml/artifacts/imitation-v1/imitation_checkpoint_best.pt --output-dir models/gru`);
}

main().catch(console.error);
