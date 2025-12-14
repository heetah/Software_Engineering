/**
 * 測試 Contract Repair Agent
 * 使用現有的有問題專案來測試 AI 修復功能
 */

import ContractValidator from './agents/contract-validator.js';
import ContractRepairAgent from './agents/contract-repair-agent.js';
import GeminiService from './services/gemini.js';

async function testRepair() {
  const sessionId = 'eea23e66-ca3a-4767-ba9f-2f6db17f4b9f'; // 有問題的專案
  
  console.log('🧪 測試 Contract Repair Agent\n');
  console.log('═'.repeat(70));
  console.log(`專案 ID: ${sessionId}\n`);
  
  try {
    // 1. 初始化服務
    const geminiService = new GeminiService();
    const validator = new ContractValidator();
    const repairAgent = new ContractRepairAgent(geminiService);
    
    // 2. 驗證當前狀態
    console.log('1️⃣ 驗證當前專案狀態...\n');
    const initialValidation = await validator.validateSession(sessionId);
    
    if (initialValidation.isValid) {
      console.log('✅ 專案已經完全正確，無需修復！');
      return;
    }
    
    const report = validator.generateReport(initialValidation);
    console.log(report);
    
    // 3. 執行 AI 修復
    console.log('\n2️⃣ 執行 AI 修復...\n');
    const repairResult = await repairAgent.repair(sessionId, initialValidation);
    
    if (!repairResult.success) {
      console.error('❌ 修復失敗:', repairResult.error);
      return;
    }
    
    console.log('\n修復摘要:');
    console.log(`  - 修復文件數: ${repairResult.summary.fixedFileCount}`);
    console.log(`  - 總變更數: ${repairResult.summary.totalChanges}`);
    console.log(`  - 修復的文件: ${repairResult.summary.files.join(', ')}\n`);
    
    // 4. 重新驗證
    console.log('3️⃣ 重新驗證修復結果...\n');
    const postRepairValidation = await validator.validateSession(sessionId);
    
    if (postRepairValidation.isValid) {
      console.log('🎉 驗證通過！專案契約完全一致！\n');
    } else {
      console.log('⚠️  仍有部分問題:\n');
      const postReport = validator.generateReport(postRepairValidation);
      console.log(postReport);
    }
    
    console.log('═'.repeat(70));
    console.log('測試完成！\n');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    console.error(error.stack);
  }
}

testRepair();
