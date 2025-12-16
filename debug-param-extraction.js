/**
 * 調試參數提取
 */
import fs from 'fs/promises';
import path from 'path';

const TEST_SESSION = 'test-broken-001';

// 測試 regex 匹配
const testRegex = () => {
  const mainCode = `
ipcMain.handle('save-note', async (event, { filename, content }) => {
  return { success: true };
});
  `;

  const preloadCode = `
saveNote: (filename, content) => ipcRenderer.invoke('save-note', filename, content),
  `;

  const ipcRegex = /ipc(?:Main|Renderer)\.(?:handle|on|invoke|send)\s*\(\s*["']([^"']+)["']/gi;

  console.log("Testing main.js:");
  let match = ipcRegex.exec(mainCode);
  console.log(match);

  console.log("\nTesting preload.js:");
  ipcRegex.lastIndex = 0; // Reset
  match = ipcRegex.exec(preloadCode);
  console.log(match);

  // Test parameter extraction
  console.log("\nTesting parameter extraction:");
  const context = preloadCode.substring(match.index, match.index + 100);
  console.log("Context:", context);

  const invokeParamsMatch = context.match(/invoke\s*\(\s*['"][^'"]+['"]\s*,\s*([^)]+)\)/);
  console.log("Params match:", invokeParamsMatch);
};

async function checkActualFiles() {
  const outputDir = path.join(process.cwd(), 'output', TEST_SESSION);

  const mainContent = await fs.readFile(path.join(outputDir, 'main.js'), 'utf-8');
  const preloadContent = await fs.readFile(path.join(outputDir, 'preload.js'), 'utf-8');

  console.log("\nActual file check:");
  console.log("\n=== main.js save-note handler ===");
  const mainMatch = mainContent.match(/ipcMain\.handle\('save-note'[^{]*\{[\s\S]{0,200}/);
  console.log(mainMatch ? mainMatch[0] : 'Not found');

  console.log("\n=== preload.js saveNote ===");
  const preloadMatch = preloadContent.match(/saveNote:[\s\S]{0,100}/);
  console.log(preloadMatch ? preloadMatch[0] : 'Not found');
}

console.log("=".repeat(60));
console.log("Debugging parameter extraction");
console.log("=".repeat(60));

testRegex();
checkActualFiles().then(() => console.log("\n✅ Test completed")).catch(console.error);
