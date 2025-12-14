/**
 * 測試檢測有錯誤的專案
 */
import ContractValidator from "./agents/contract-validator.js";

const TEST_SESSION = 'test-broken-001';

async function testBrokenProject() {
  console.log("=".repeat(60));
  console.log("測試檢測參數格式錯誤");
  console.log("=".repeat(60));
  console.log(`Session ID: ${TEST_SESSION}\n`);
  
  const validator = new ContractValidator();
  
  console.log("📋 執行驗證...\n");
  const validation = await validator.validateSession(TEST_SESSION);
  
  console.log(`驗證結果: ${validation.isValid ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`總問題數: ${validation.summary.totalIssues}`);
  console.log(`嚴重問題: ${validation.summary.criticalIssues}`);
  console.log(`警告問題: ${validation.summary.warningIssues}\n`);
  
  // 顯示所有問題類型
  const issues = validation.issues;
  console.log("問題分類:");
  console.log(`  - 缺失頻道: ${issues.missingChannels?.length || 0}`);
  console.log(`  - 額外頻道: ${issues.extraChannels?.length || 0}`);
  console.log(`  - 名稱不匹配: ${issues.nameMismatches?.length || 0}`);
  console.log(`  - 缺失生產者: ${issues.missingProducers?.length || 0}`);
  console.log(`  - 缺失消費者: ${issues.missingConsumers?.length || 0}`);
  console.log(`  - 參數不匹配: ${issues.parameterMismatches?.length || 0}\n`);
  
  // 重點檢查參數不匹配
  if (issues.parameterMismatches && issues.parameterMismatches.length > 0) {
    console.log("🎯 成功檢測到參數格式錯誤！\n");
    console.log("詳細問題:");
    for (const issue of issues.parameterMismatches) {
      console.log(`\n  📍 IPC 頻道: ${issue.endpoint}`);
      console.log(`     嚴重程度: ${issue.severity}`);
      console.log(`     ${issue.file1}:`);
      console.log(`       類型: ${validator.formatTypeDescription(issue.format1)}`);
      console.log(`       原始: ${issue.format1.raw}`);
      console.log(`     ${issue.file2}:`);
      console.log(`       類型: ${validator.formatTypeDescription(issue.format2)}`);
      console.log(`       原始: ${issue.format2.raw}`);
      console.log(`     描述: ${issue.description}`);
    }
    console.log("\n✅ 參數格式檢測功能正常工作！");
  } else {
    console.log("❌ 未檢測到參數格式錯誤（檢測失敗）");
    console.log("\n調試信息：");
    console.log(JSON.stringify(validation.issues, null, 2));
  }
  
  // 完整報告
  console.log("\n" + "=".repeat(60));
  console.log("完整驗證報告");
  console.log("=".repeat(60));
  const report = validator.generateReport(validation);
  console.log(report);
}

testBrokenProject().catch(console.error);
