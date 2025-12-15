/**
 * 測試函數定義查找
 */
import fs from 'fs/promises';
import path from 'path';

const TEST_SESSION = 'test-broken-001';

async function testFunctionTracking() {
  console.log("測試函數定義追蹤\n");
  
  const outputDir = path.join(process.cwd(), 'output', TEST_SESSION);
  const mainContent = await fs.readFile(path.join(outputDir, 'main.js'), 'utf-8');
  
  // 測試查找 handleSaveNote
  const functionName = 'handleSaveNote';
  
  console.log(`🔍 查找函數: ${functionName}\n`);
  
  const patterns = [
    new RegExp(`async\\s+function\\s+${functionName}\\s*\\(\\s*\\w+\\s*,\\s*({[^}]*}|\\w+)`, 'i'),
    new RegExp(`function\\s+${functionName}\\s*\\(\\s*\\w+\\s*,\\s*({[^}]*}|\\w+)`, 'i'),
  ];
  
  for (let i = 0; i < patterns.length; i++) {
    console.log(`Pattern ${i + 1}:`);
    const match = mainContent.match(patterns[i]);
    if (match) {
      console.log('  ✓ 匹配成功！');
      console.log(`  參數: ${match[1]}`);
      console.log(`  完整匹配: ${match[0]}\n`);
    } else {
      console.log('  ✗ 無匹配\n');
    }
  }
  
  // 顯示函數定義的實際內容
  console.log("實際函數定義:");
  const funcMatch = mainContent.match(/async function handleSaveNote[\s\S]{0,150}/);
  console.log(funcMatch ? funcMatch[0] : '未找到');
}

testFunctionTracking().catch(console.error);
