/**
 * 測試驗證和修復流程
 */
import ContractValidator from "./agents/contract-validator.js";
import ContractAutoFixer from "./agents/contract-auto-fixer.js";
import ContractRepairAgent from "./agents/contract-repair-agent.js";
import { askGemini } from "./services/gemini.js";

const SESSION_ID = '814011e2-79a0-40c4-ac7e-401206374ece';

async function testValidation() {
  console.log("=".repeat(60));
  console.log("測試專案驗證流程");
  console.log("=".repeat(60));

  const contractValidator = new ContractValidator();
  const contractAutoFixer = new ContractAutoFixer();

  // 第一步：驗證
  console.log("\n📋 第一步：驗證契約...");
  const validation = await contractValidator.validateSession(SESSION_ID);
  console.log(`驗證結果: ${validation.isValid ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`總問題數: ${validation.summary.totalIssues}`);
  console.log('\n問題詳情:');
  console.log(JSON.stringify(validation.issues, null, 2));

  // 第二步：程式化修復
  console.log("\n🔧 第二步：程式化修復...");
  const fixResult = await contractAutoFixer.checkAndFix(SESSION_ID, contractValidator);
  console.log(`需要 AI?: ${fixResult.needsAI}`);
  if (fixResult.fixResult) {
    console.log(`修復成功: ${fixResult.fixResult.successCount}`);
    console.log(`修復失敗: ${fixResult.fixResult.failCount}`);
  }

  // 第三步：重新驗證
  console.log("\n📋 第三步：重新驗證...");
  const revalidation = await contractValidator.validateSession(SESSION_ID);
  console.log(`驗證結果: ${revalidation.isValid ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`剩餘問題數: ${revalidation.summary.totalIssues}`);

  if (!revalidation.isValid) {
    console.log('\n剩餘問題:');
    console.log(JSON.stringify(revalidation.issues, null, 2));

    // 第四步：AI 深度修復
    console.log("\n🤖 第四步：AI 深度修復...");
    const geminiService = {
      generateContent: async (prompt) => {
        const result = await askGemini(prompt);
        if (!result.ok) {
          throw new Error(result.error || 'Gemini API error');
        }
        return { response: { text: () => result.response } };
      }
    };

    const contractRepairAgent = new ContractRepairAgent(geminiService);
    const repairResult = await contractRepairAgent.repair(SESSION_ID, revalidation);

    if (repairResult.success) {
      console.log("\n✅ AI 修復完成！");
      console.log(`   修復文件數: ${repairResult.summary.fixedFileCount}`);
      console.log(`   總變更數: ${repairResult.summary.totalChanges}`);
      console.log(`   修復的文件: ${repairResult.summary.files.join(', ')}`);

      // 最終驗證
      const finalValidation = await contractValidator.validateSession(SESSION_ID);
      console.log(`\n最終驗證: ${finalValidation.isValid ? '✅ 通過' : '⚠️ 仍有問題'}`);
      if (!finalValidation.isValid) {
        console.log('剩餘問題:');
        console.log(JSON.stringify(finalValidation.issues, null, 2));
      }
    } else {
      console.log("\n❌ AI 修復失敗");
      console.log(repairResult.error);
    }
  }
}

testValidation().catch(console.error);
