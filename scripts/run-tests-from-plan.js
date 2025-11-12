import TesterAgent from '../agents/tester-agent.js';

async function main() {
  const tester = new TesterAgent();
  const res = await tester.runPipeline({ useVerifiedSummary: true, requirePlan: true });
  console.log('Tests executed from existing plan. Artifacts:', res);
}

main().catch(err => {
  console.error('run-tests-from-plan failed:', err.message);
  process.exit(1);
});
