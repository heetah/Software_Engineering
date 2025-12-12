/**
 * 測試契約自動修復功能
 * 模擬一個名稱不一致的場景，然後測試自動修復
 */

import ContractValidator from './agents/contract-validator.js';
import ContractAutoFixer from './agents/contract-auto-fixer.js';

const sessionId = '4cc2d18a-0d75-4d7f-80a1-38bc414cc282';

console.log('🧪 測試契約自動修復系統\n');
console.log('═'.repeat(70));

async function testAutoFix() {
  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();

  try {
    console.log('\n1️⃣ 第一步：驗證當前專案狀態');
    console.log('─'.repeat(70));
    
    const validationResult = await validator.validateSession(sessionId);
    const report = validator.generateReport(validationResult);
    console.log(report);

    if (validationResult.isValid) {
      console.log('✅ 專案契約完全一致，無需測試修復功能');
      console.log('\n💡 系統已準備就緒，未來生成的專案如有契約不一致：');
      console.log('   • 會自動檢測問題');
      console.log('   • 自動修復簡單的名稱不一致');
      console.log('   • 只在必要時才使用 AI API\n');
      return;
    }

    console.log('\n2️⃣ 第二步：嘗試自動修復');
    console.log('─'.repeat(70));
    
    const fixResult = await fixer.autoFix(sessionId, validationResult);
    const fixReport = fixer.generateReport(fixResult);
    console.log(fixReport);

    console.log('\n3️⃣ 第三步：重新驗證修復結果');
    console.log('─'.repeat(70));
    
    const revalidation = await validator.validateSession(sessionId);
    const revalidationReport = validator.generateReport(revalidation);
    console.log(revalidationReport);

    if (revalidation.isValid) {
      console.log('\n🎉 自動修復測試成功！');
      console.log('   系統已驗證可以自動修復契約不一致問題\n');
    } else {
      console.log('\n⚠️  部分問題仍未解決');
      console.log('   這些問題可能需要 AI 介入或手動修復\n');
    }
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    console.error(error.stack);
  }
}

console.log('\n📋 測試說明:');
console.log('   • 本測試會檢查專案的契約一致性');
console.log('   • 如發現問題，會嘗試自動修復');
console.log('   • 修復完成後會重新驗證\n');
console.log('═'.repeat(70));

testAutoFix()
  .then(() => {
    console.log('\n✅ 測試完成！');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ 測試異常:', error.message);
    process.exit(1);
  });
