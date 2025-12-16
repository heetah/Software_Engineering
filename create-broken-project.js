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
  console.log("Creating a project with parameter format errors");
  console.log("=".repeat(60));

  const sourceDir = path.join(process.cwd(), 'output', SOURCE_SESSION);
  const testDir = path.join(process.cwd(), 'output', TEST_SESSION);
  const sessionDataDir = path.join(process.cwd(), 'data/sessions', TEST_SESSION);

  // 1. Copy project files
  console.log("\n📁 Copying project files...");
  await copyDirectory(sourceDir, testDir);
  console.log(`   ✓ Copied to: ${testDir}`);

  // 2. Copy session data
  console.log("\n📄 Copying session data...");
  const sourceSessionDir = path.join(process.cwd(), 'data/sessions', SOURCE_SESSION);
  await copyDirectory(sourceSessionDir, sessionDataDir);
  console.log(`   ✓ Copied to: ${sessionDataDir}`);

  // 3. 修改 preload.js - 製造參數格式錯誤
  console.log("\n🔧 Producing parameter format errors...");
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

  console.log("   ✓ Modified preload.js:");
  for (const change of changes) {
    console.log(`     - ${change}`);
  }

  // 4. 修改 architecture.json 的 ID
  console.log("\n🔧 Updating architecture.json...");
  const archPath = path.join(sessionDataDir, 'architecture.json');
  let archContent = await fs.readFile(archPath, 'utf-8');
  archContent = archContent.replace(new RegExp(SOURCE_SESSION, 'g'), TEST_SESSION);
  await fs.writeFile(archPath, archContent, 'utf-8');
  console.log(`   ✓ Updated session ID`);

  console.log("\n" + "=".repeat(60));
  console.log(" Test project created!");
  console.log("=".repeat(60));
  console.log(`Session ID: ${TEST_SESSION}`);
  console.log(`Project path: ${testDir}`);
  console.log("\nExpected errors:");
  console.log("  1. saveNote: preload (filename, content), main {filename, content}");
  console.log("  2. loadNote: preload (filename), main {filename}");
  console.log("  3. generateNote: preload (prompt), main {prompt}");
  console.log("\nNow you can run the validation test!\n");

  return TEST_SESSION;
}

createBrokenProject().catch(console.error);
