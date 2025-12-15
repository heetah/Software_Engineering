/**
 * 創建一個有參數格式錯誤的測試專案
 */
import fs from 'fs/promises';
import path from 'path';

const SOURCE_SESSION = '814011e2-79a0-40c4-ac7e-401206374ece';
const TEST_SESSION = 'test-broken-params-001';

async function copyDirectory(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        await copyDirectory(srcPath, destPath);
      }
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function createBrokenProject() {
  console.log("=".repeat(60));
  console.log("創建有錯誤的測試專案");
  console.log("=".repeat(60));
  
  const sourceDir = path.join(process.cwd(), 'output', SOURCE_SESSION);
  const testDir = path.join(process.cwd(), 'output', TEST_SESSION);
  const sessionDataDir = path.join(process.cwd(), 'data/sessions', TEST_SESSION);
  
  // 1. 複製專案文件
  console.log("\n📁 複製專案文件...");
  await copyDirectory(sourceDir, testDir);
  console.log(`   ✓ 複製到: ${testDir}`);
  
  // 2. 複製 session 數據
  console.log("\n📄 複製 session 數據...");
  const sourceSessionDir = path.join(process.cwd(), 'data/sessions', SOURCE_SESSION);
  await copyDirectory(sourceSessionDir, sessionDataDir);
  console.log(`   ✓ 複製到: ${sessionDataDir}`);
  
  // 3. 修改 preload.js - 製造參數格式錯誤
  console.log("\n🔧 製造參數格式錯誤...");
  const preloadPath = path.join(testDir, 'preload.js');
  let preloadContent = await fs.readFile(preloadPath, 'utf-8');
  
  const changes = [];
  
  // 錯誤 1: saveNote 改為多參數傳遞
  preloadContent = preloadContent.replace(
    "ipcRenderer.invoke('save-note', { filename, content })",
    "ipcRenderer.invoke('save-note', filename, content)"
  );
  changes.push("saveNote: 物件 → 多參數");
  
  // 錯誤 2: loadNote 改為多參數
  preloadContent = preloadContent.replace(
    "ipcRenderer.invoke('load-note', { filename })",
    "ipcRenderer.invoke('load-note', filename)"
  );
  changes.push("loadNote: 物件 → 單參數");
  
  // 錯誤 3: generateNote 改為多參數
  preloadContent = preloadContent.replace(
    "ipcRenderer.invoke('generate-note', { prompt })",
    "ipcRenderer.invoke('generate-note', prompt)"
  );
  changes.push("generateNote: 物件 → 單參數");
  
  await fs.writeFile(preloadPath, preloadContent, 'utf-8');
  
  console.log("   ✓ 已修改 preload.js:");
  for (const change of changes) {
    console.log(`     - ${change}`);
  }
  
  // 4. 修改 architecture.json 的 ID
  console.log("\n🔧 更新 architecture.json...");
  const archPath = path.join(sessionDataDir, 'architecture.json');
  let archContent = await fs.readFile(archPath, 'utf-8');
  archContent = archContent.replace(new RegExp(SOURCE_SESSION, 'g'), TEST_SESSION);
  await fs.writeFile(archPath, archContent, 'utf-8');
  console.log(`   ✓ 已更新 session ID`);
  
  console.log("\n" + "=".repeat(60));
  console.log("✅ 測試專案創建完成！");
  console.log("=".repeat(60));
  console.log(`Session ID: ${TEST_SESSION}`);
  console.log(`專案路徑: ${testDir}`);
  console.log("\n預期錯誤:");
  console.log("  1. saveNote: preload 傳 (filename, content), main 期望 {filename, content}");
  console.log("  2. loadNote: preload 傳 (filename), main 期望 {filename}");
  console.log("  3. generateNote: preload 傳 (prompt), main 期望 {prompt}");
  console.log("\n現在可以執行驗證測試！\n");
  
  return TEST_SESSION;
}

createBrokenProject().catch(console.error);
