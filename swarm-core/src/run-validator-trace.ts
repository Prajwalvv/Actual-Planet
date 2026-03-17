import { SwarmEngine } from './swarm-engine';
import { FileAgentTraceCollector } from './agents/agent-trace-collector';
import path from 'path';

const VALIDATION_QUERIES = [
  "Is climate change caused by human activity?",
  "Are vaccines safe and effective?",
  "Did the 2020 US election have widespread fraud?",
  "Is cryptocurrency a good investment?",
  "Does intermittent fasting improve health?",
  "Is nuclear energy safer than fossil fuels?",
  "Are GMO foods harmful to health?",
  "Does social media cause depression?",
  "Is artificial intelligence dangerous?",
  "Will electric vehicles replace gas cars?",
  "Is remote work more productive?",
  "Does coffee cause or prevent cancer?",
  "Are organic foods healthier?",
  "Is the stock market overvalued in 2026?",
  "Does meditation reduce stress?",
  "Are self-driving cars safer than human drivers?",
  "Is inflation transitory or persistent?",
  "Does exercise prevent Alzheimer's?",
  "Are video games addictive?",
  "Is renewable energy economically viable?",
  "Does sugar cause diabetes?",
  "Are probiotics beneficial for gut health?",
  "Is working from home bad for mental health?",
  "Does screen time harm children's development?",
  "Are plant-based diets healthier than omnivore diets?",
  "Is 5G technology safe?",
  "Does minimum wage increase unemployment?",
  "Are antidepressants overprescribed?",
  "Is dark matter real?",
  "Does red wine prevent heart disease?",
  "Are electric scooters environmentally friendly?",
  "Is the housing market in a bubble?",
  "Does vitamin D prevent COVID-19?",
  "Are microplastics harmful to humans?",
  "Is universal basic income feasible?",
  "Does blue light from screens damage eyes?",
  "Are lab-grown meats sustainable?",
  "Is the metaverse the future of the internet?",
  "Does intermittent fasting cause muscle loss?",
  "Are NFTs a legitimate investment?",
  "Is gene editing ethical?",
  "Does marijuana have medical benefits?",
  "Are electric bikes better than regular bikes?",
  "Is the gig economy good for workers?",
  "Does keto diet improve brain function?",
  "Are smart homes secure from hacking?",
  "Is space exploration worth the cost?",
  "Does cold exposure boost immunity?",
  "Are protein supplements necessary?",
  "Is quantum computing practical yet?",
  "Does sleep deprivation cause weight gain?",
  "Are carbon offsets effective?",
  "Is the four-day work week productive?",
  "Does intermittent fasting slow aging?",
  "Are electric planes feasible?",
  "Is blockchain technology overhyped?",
  "Does air pollution cause dementia?",
  "Are standing desks healthier?",
  "Is the singularity near?",
  "Does fasting cure autoimmune diseases?",
  "Are heat pumps better than gas furnaces?",
  "Is the great resignation permanent?",
  "Does creatine improve cognitive function?",
  "Are vertical farms the future of agriculture?",
  "Is degrowth economics viable?",
  "Does intermittent fasting improve longevity?",
  "Are hydrogen fuel cells better than batteries?",
  "Is the labor shortage real or manufactured?",
  "Does cold plunge therapy work?",
  "Are 15-minute cities dystopian?",
  "Is AI art real art?",
  "Does carnivore diet reverse diabetes?",
  "Are heat waves getting worse?",
  "Is the dollar losing reserve currency status?",
  "Does grounding improve health?",
  "Are insect proteins sustainable?",
  "Is deglobalization happening?",
  "Does breathwork reduce anxiety?",
  "Are modular homes the future?",
  "Is the chip shortage over?",
  "Does sauna use extend lifespan?",
  "Are 3D-printed houses viable?",
  "Is the petrodollar ending?",
  "Does red light therapy work?",
  "Are tiny homes practical?",
  "Is the commercial real estate market collapsing?",
  "Does ice bath recovery work?",
  "Are co-living spaces sustainable?",
  "Is the banking crisis over?",
  "Does NAD+ supplementation reverse aging?",
  "Are passive houses worth the cost?",
  "Is the semiconductor industry reshoring?",
  "Does peptide therapy work?",
  "Are earthships practical homes?",
  "Is the energy transition affordable?",
  "Does methylene blue improve cognition?",
  "Are shipping container homes safe?",
  "Is the supply chain crisis resolved?",
  "Does NMN supplementation extend lifespan?",
  "Are geodesic domes energy efficient?",
  "Is the rare earth shortage critical?",
  "Does rapamycin slow aging in humans?",
  "Are straw bale houses fire resistant?",
];

async function main() {
  console.log(`🧪 Starting Validator-Focused Trace Collection`);
  console.log(`📊 Running ${VALIDATION_QUERIES.length} controversial/fact-checking queries\n`);

  const traceDir = path.join(process.cwd(), 'runtime-artifacts', 'agent-traces');
  const collector = new FileAgentTraceCollector(traceDir);

  const engine = new SwarmEngine({
    id: 'validator-trace-engine',
  });

  await engine.start();

  let totalEvidence = 0;

  for (let i = 0; i < VALIDATION_QUERIES.length; i++) {
    const query = VALIDATION_QUERIES[i];
    console.log(`\n[${i + 1}/${VALIDATION_QUERIES.length}] Query: "${query}"`);
    
    try {
      const result = await engine.executeQuery(
        {
          query,
          depth: 'standard',
          modelId: 'default',
          timeoutSec: 30,
        },
        {
          queuePosition: i,
          queueWaitMs: 0,
          autoStarted: false,
          restartedForModel: false,
          coldStartMs: 0,
          timeoutRequestedSec: 30,
        }
      );

      const evidenceCount = result.evidence?.length || 0;
      totalEvidence += evidenceCount;
      
      console.log(`  ✓ Evidence: ${evidenceCount}`);
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error: any) {
      console.error(`  ✗ Error: ${error.message}`);
    }
  }

  await engine.stop();

  console.log(`\n✅ Trace Collection Complete`);
  console.log(`📊 Total Evidence: ${totalEvidence}`);
  console.log(`📁 Traces saved to: ${traceDir}`);
  console.log(`\nNext: Run training with: cd ml/agents && python train_validator.py`);
}

main().catch(console.error);
