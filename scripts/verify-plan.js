import VerifiedAgent from '../agents/verified-agent.js';

async function main() {
  const verified = new VerifiedAgent();
  const { path, plan } = await verified.generatePlan();
  console.log('Test plan generated at:', path);
  console.log('Suites:', (plan.suites || []).length);
}

main().catch(err => {
  console.error('verify-plan failed:', err.message);
  process.exit(1);
});
