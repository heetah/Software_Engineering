/**
 * 測試參數格式檢測
 */
import ContractValidator from "./agents/contract-validator.js";
import fs from 'fs/promises';
import path from 'path';

const SESSION_ID = '814011e2-79a0-40c4-ac7e-401206374ece';

async function createTestCase() {
  const outputDir = path.join(process.cwd(), 'output', SESSION_ID);
  const preloadPath = path.join(outputDir, 'preload.js');
  
  // 讀取原始 preload.js
  const content = await fs.readFile(preloadPath, 'utf-8');
  
  // 創建一個測試版本（恢復成錯誤的格式）
  const brokenContent = content
    .replace("ipcRenderer.invoke('save-note', { filename, content })", 
             "ipcRenderer.invoke('save-note', filename, content)")
    .replace("ipcRenderer.invoke('load-note', { filename })", 
             "ipcRenderer.invoke('load-note', filename)")
    .replace("ipcRenderer.invoke('generate-note', { prompt })", 
             "ipcRenderer.invoke('generate-note', prompt)");
  
  const testPath = path.join(outputDir, 'preload.test.js');
  await fs.writeFile(testPath, brokenContent, 'utf-8');
  
  console.log(`✅ 創建測試文件: ${testPath}`);
  console.log('   (包含參數格式錯誤)\n');
  
  return testPath;
}

async function testParameterDetection() {
  console.log("=".repeat(60));
  console.log("測試參數格式檢測功能");
  console.log("=".repeat(60));
  
  // 創建測試文件
  const testPath = await createTestCase();
  
  // 暫時替換 preload.js
  const outputDir = path.join(process.cwd(), 'output', SESSION_ID);
  const preloadPath = path.join(outputDir, 'preload.js');
  const backupPath = path.join(outputDir, 'preload.backup.js');
  
  await fs.copyFile(preloadPath, backupPath);
  await fs.copyFile(testPath, preloadPath);
  
  try {
    console.log("\n📋 執行驗證（使用錯誤的參數格式）...\n");
    
    const validator = new ContractValidator();
    const validation = await validator.validateSession(SESSION_ID);
    
    console.log(`驗證結果: ${validation.isValid ? '✅ 通過' : '❌ 失敗'}`);
    console.log(`總問題數: ${validation.summary.totalIssues}`);
    console.log(`嚴重問題: ${validation.summary.criticalIssues}\n`);
    
    if (validation.issues.parameterMismatches) {
      console.log("🎯 參數不匹配檢測結果:");
      console.log(`   發現 ${validation.issues.parameterMismatches.length} 個參數格式問題\n`);
      
      for (const issue of validation.issues.parameterMismatches) {
        console.log(`   📍 頻道: ${issue.endpoint}`);
        console.log(`      問題: ${issue.description}`);
        console.log(`      ${issue.file1}: ${validator.formatTypeDescription(issue.format1)}`);
        console.log(`      ${issue.file2}: ${validator.formatTypeDescription(issue.format2)}\n`);
      }
    } else {
      console.log("❌ 沒有檢測到參數格式問題（檢測失敗）\n");
    }
    
    // 生成報告
    console.log("\n" + "=".repeat(60));
    console.log("完整驗證報告:");
    console.log("=".repeat(60));
    const report = validator.generateReport(validation);
    console.log(report);
    
  } finally {
    // 恢復原始文件
    await fs.copyFile(backupPath, preloadPath);
    await fs.unlink(backupPath);
    await fs.unlink(testPath);
    console.log("\n✅ 已恢復原始 preload.js");
  }
}

testParameterDetection().catch(console.error);
