/**
 * 測試自動修復參數格式錯誤
 */
import ContractValidator from "./agents/contract-validator.js";
import ContractAutoFixer from "./agents/contract-auto-fixer.js";
import fs from 'fs/promises';
import path from 'path';

const TEST_SESSION = 'test-broken-001';

async function resetPreloadFile() {
  // 先恢復錯誤版本以便測試
  const preloadPath = path.join(process.cwd(), 'output', TEST_SESSION, 'preload.js');
  let content = await fs.readFile(preloadPath, 'utf-8');
  
  // 確保是錯誤版本（如果已經修復，改回錯誤版本）
  content = content
    .replace("ipcRenderer.invoke('save-note', { filename, content })", 
             "ipcRenderer.invoke('save-note', filename, content)")
    .replace("ipcRenderer.invoke('load-note', { filename })", 
             "ipcRenderer.invoke('load-note', filename)")
    .replace("ipcRenderer.invoke('generate-note', { prompt })", 
             "ipcRenderer.invoke('generate-note', prompt)");
  
  await fs.writeFile(preloadPath, content, 'utf-8');
  console.log("✅ 已重置 preload.js 為錯誤版本\n");
}

async function testAutoFix() {
  console.log("=".repeat(60));
  console.log("測試自動修復參數格式錯誤");
  console.log("=".repeat(60) + "\n");
  
  // 1. 重置為錯誤版本
  await resetPreloadFile();
  
  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();
  
  // 2. 驗證問題
  console.log("📋 第一步：驗證問題...\n");
  const validation1 = await validator.validateSession(TEST_SESSION);
  console.log(`驗證結果: ${validation1.isValid ? '✅ 通過' : '❌ 失敗'}`);
  console.log(`參數不匹配: ${validation1.issues.parameterMismatches?.length || 0} 個\n`);
  
  if (!validation1.issues.parameterMismatches?.length) {
    console.log("❌ 沒有檢測到參數格式錯誤，測試失敗");
    return;
  }
  
  // 顯示問題詳情
  console.log("發現的問題:");
  for (const mm of validation1.issues.parameterMismatches) {
    console.log(`  ⚠️  ${mm.endpoint}: ${mm.format1?.raw || mm.format1?.type} vs ${mm.format2?.raw || mm.format2?.type}`);
  }
  console.log();
  
  // 3. 自動修復
  console.log("🔧 第二步：自動修復...\n");
  const fixResult = await fixer.autoFix(TEST_SESSION, validation1);
  
  console.log(`修復結果:`);
  console.log(`  成功: ${fixResult.successCount}`);
  console.log(`  失敗: ${fixResult.failCount}`);
  console.log(`  總嘗試: ${fixResult.totalAttempted}\n`);
  
  if (fixResult.fixed.length > 0) {
    console.log("修復詳情:");
    for (const fix of fixResult.fixed) {
      console.log(`  ✓ ${fix.channel}: ${fix.from} → ${fix.to}`);
    }
    console.log();
  }
  
  // 4. 再次驗證
  console.log("📋 第三步：驗證修復結果...\n");
  const validation2 = await validator.validateSession(TEST_SESSION);
  console.log(`驗證結果: ${validation2.isValid ? '✅ 通過' : '❌ 仍有問題'}`);
  console.log(`剩餘參數不匹配: ${validation2.issues.parameterMismatches?.length || 0} 個\n`);
  
  // 5. 顯示修復後的文件內容
  console.log("📄 修復後的 preload.js 關鍵部分:");
  const preloadPath = path.join(process.cwd(), 'output', TEST_SESSION, 'preload.js');
  const preloadContent = await fs.readFile(preloadPath, 'utf-8');
  const invokeLines = preloadContent.match(/ipcRenderer\.invoke.*/g);
  if (invokeLines) {
    for (const line of invokeLines) {
      console.log(`  ${line.trim()}`);
    }
  }
  
  console.log("\n" + "=".repeat(60));
  if (validation2.isValid || (validation2.issues.parameterMismatches?.length || 0) === 0) {
    console.log("🎉 測試通過！自動修復功能正常工作！");
  } else {
    console.log("⚠️  仍有問題需要處理");
  }
  console.log("=".repeat(60));
}

testAutoFix().catch(console.error);
