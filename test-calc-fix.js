/**
 * 修復計算機網站的 IPC 契約問題
 */
import ContractValidator from "./agents/contract-validator.js";
import ContractAutoFixer from "./agents/contract-auto-fixer.js";

const SESSION_ID = '4d88ef1e-f7ff-40b1-95ca-cb01d1bc3339';

async function fixCalculator() {
  console.log("=".repeat(60));
  console.log("修復計算機網站 IPC 契約");
  console.log("=".repeat(60) + "\n");
  
  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();
  
  // 1. 驗證問題
  console.log("📋 驗證問題...\n");
  const validation = await validator.validateSession(SESSION_ID);
  
  if (validation.isValid) {
    console.log("✅ 沒有發現問題！");
    return;
  }
  
  const report = validator.generateReport(validation);
  console.log(report);
  
  // 2. 自動修復
  console.log("\n🔧 開始自動修復...\n");
  const fixResult = await fixer.autoFix(SESSION_ID, validation);
  const fixReport = fixer.generateReport(fixResult);
  console.log(fixReport);
  
  // 3. 重新驗證
  console.log("\n📋 重新驗證...\n");
  const validation2 = await validator.validateSession(SESSION_ID);
  
  if (validation2.isValid) {
    console.log("✅ 修復完成！所有契約一致！");
  } else {
    console.log("⚠️  仍有問題：");
    console.log(validator.generateReport(validation2));
  }
}

fixCalculator().catch(console.error);
