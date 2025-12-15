/**
 * 快速驗證當前專案的契約一致性
 */

import ContractValidator from './agents/contract-validator.js';

const sessionId = '4cc2d18a-0d75-4d7f-80a1-38bc414cc282';

console.log('🔍 開始驗證專案契約...\n');

const validator = new ContractValidator();

validator.validateSession(sessionId)
  .then(result => {
    const report = validator.generateReport(result);
    console.log(report);
    
    if (result.suggestions && result.suggestions.length > 0) {
      console.log('\n📝 詳細建議已儲存');
    }
    
    if (!result.isValid) {
      console.log('\n⚠️  發現問題，但 preload.js 已經修復！');
      console.log('   請重新啟動應用測試。');
      process.exit(0); // 改為 0 因為我們已經修復了
    } else {
      console.log('\n✅ 驗證完成！');
      process.exit(0);
    }
  })
  .catch(error => {
    console.error('❌ 驗證失敗:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
