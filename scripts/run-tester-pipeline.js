import TesterAgent from '../agents/tester-agent.js';
import VerifiedAgent from '../agents/verified-agent.js';

async function main() {
  const verified = new VerifiedAgent();
  try {
    await verified.generatePlan();
  } catch (e) {
    console.warn('Verified Agent failed to generate plan; tester will fallback:', e.message);
  }
  const tester = new TesterAgent();
  const res = await tester.runPipeline({ useVerifiedSummary: true });
  console.log('Pipeline artifacts:', res);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
