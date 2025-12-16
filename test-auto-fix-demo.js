/**
 * 展示完整的自動修復流程
 */
import ContractValidator from "./agents/contract-validator.js";
import ContractAutoFixer from "./agents/contract-auto-fixer.js";

const SESSION_ID = process.argv[2] || 'adf2409c-82c3-4bf2-915e-a779f532cfd8';

async function demo() {
  console.log("=".repeat(70));
  console.log("📋 Contract Validator & Auto-Fixer Demo");
  console.log("=".repeat(70));
  console.log(`\nSession ID: ${SESSION_ID}\n`);
  
  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();
  
  // 1. 驗證
  console.log("🔍 第一步：驗證專案...\n");
  const validation1 = await validator.validateSession(SESSION_ID);
  
  if (validation1.isValid) {
    console.log("✅ 驗證通過！專案沒有問題。\n");
  } else {
    console.log("❌ 發現問題：\n");
    
    if (validation1.issues.htmlPathErrors?.length > 0) {
      console.log(`  📄 HTML 路徑錯誤: ${validation1.issues.htmlPathErrors.length} 個`);
      for (const err of validation1.issues.htmlPathErrors) {
        console.log(`     - ${err.file}: ${err.incorrect} → ${err.correct}`);
      }
    }
    
    if (validation1.issues.exportSyntaxErrors?.length > 0) {
      console.log(`  📦 Export 語法錯誤: ${validation1.issues.exportSyntaxErrors.length} 個`);
      for (const err of validation1.issues.exportSyntaxErrors) {
        console.log(`     - ${err.file} (${err.context})`);
      }
    }
    
    if (validation1.issues.parameterMismatches?.length > 0) {
      console.log(`  🔄 參數格式不匹配: ${validation1.issues.parameterMismatches.length} 個`);
      for (const err of validation1.issues.parameterMismatches) {
        console.log(`     - ${err.endpoint}`);
      }
    }
    
    if (validation1.issues.nameMismatches?.length > 0) {
      console.log(`  🏷️  名稱不一致: ${validation1.issues.nameMismatches.length} 個`);
    }
    
    console.log();
    
    // 2. 自動修復
    console.log("🔧 第二步：自動修復...\n");
    const fixResult = await fixer.autoFix(SESSION_ID, validation1);
    
    console.log(`修復結果:`);
    console.log(`  ✅ 成功: ${fixResult.successCount}`);
    console.log(`  ❌ 失敗: ${fixResult.failCount}`);
    console.log(`  📊 總嘗試: ${fixResult.totalAttempted}\n`);
    
    if (fixResult.fixed.length > 0) {
      console.log("修復詳情:");
      for (const fix of fixResult.fixed) {
        console.log(`  ✓ ${fix.type}: ${fix.file || fix.channel}`);
      }
      console.log();
    }
    
    // 3. 重新驗證
    console.log("🔍 第三步：重新驗證...\n");
    const validation2 = await validator.validateSession(SESSION_ID);
    
    if (validation2.isValid) {
      console.log("✅ 驗證通過！所有問題已修復！\n");
    } else {
      console.log("⚠️  仍有問題需要處理\n");
      const report = validator.generateReport(validation2);
      console.log(report);
    }
  }
  
  console.log("=".repeat(70));
}

demo().catch(console.error);
