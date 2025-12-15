/**
 * 測試 DOM 契約驗證功能
 */

import ContractValidator from './agents/contract-validator.js';
import ContractAutoFixer from './agents/contract-auto-fixer.js';

async function testDomValidation() {
  const sessionId = '95b97543-f5c9-48ef-97b1-7ceb88148682';
  
  console.log('🧪 測試 DOM 契約驗證\n');
  console.log('═'.repeat(70));
  
  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();
  
  try {
    // 驗證契約
    console.log('\n1️⃣ 驗證契約一致性...\n');
    const validationResult = await validator.validateSession(sessionId);
    
    if (validationResult.error) {
      console.error('❌ 驗證失敗:', validationResult.error);
      return;
    }
    
    // 顯示驗證結果
    const report = validator.generateReport(validationResult);
    console.log(report);
    
    // 顯示 select 選項問題
    if (validationResult.selectIssues && validationResult.selectIssues.length > 0) {
      console.log('\n📋 Select 選項大小寫問題:\n');
      for (const issue of validationResult.selectIssues) {
        console.log(`   • Select #${issue.selectId}:`);
        console.log(`     HTML: "${issue.htmlValue}" (${issue.htmlFile})`);
        console.log(`     JS:   "${issue.jsValue}" (${issue.jsFile})`);
        console.log(`     嚴重度: ${issue.severity}\n`);
      }
    }
    
    // 如果有問題，嘗試自動修復
    if (!validationResult.isValid) {
      console.log('\n2️⃣ 嘗試自動修復...\n');
      const fixResult = await fixer.autoFix(sessionId, validationResult);
      const fixReport = fixer.generateReport(fixResult);
      console.log(fixReport);
      
      // 重新驗證
      console.log('\n3️⃣ 重新驗證契約...\n');
      const revalidationResult = await validator.validateSession(sessionId);
      const revalidationReport = validator.generateReport(revalidationResult);
      console.log(revalidationReport);
      
      if (revalidationResult.isValid) {
        console.log('✅ 所有問題已修復！\n');
      } else {
        console.log('⚠️  仍有問題需要手動處理\n');
      }
    } else {
      console.log('✅ 契約完全一致，無需修復！\n');
    }
    
    console.log('═'.repeat(70));
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    console.error(error.stack);
  }
}

testDomValidation();
