/**
 * 測試命名風格自動修復功能
 */

import ContractValidator from './agents/contract-validator.js';
import ContractAutoFixer from './agents/contract-auto-fixer.js';
import fs from 'fs/promises';
import path from 'path';

async function testNamingStyleFix() {
  console.log('🧪 Testing naming style auto fix\n');
  console.log('═'.repeat(70));

  const testSessionId = '95b97543-f5c9-48ef-97b1-7ceb88148682';

  const validator = new ContractValidator();
  const fixer = new ContractAutoFixer();

  try {
    // 先備份當前文件
    const outputDir = path.join(process.cwd(), 'output', testSessionId);
    const mainPath = path.join(outputDir, 'main.js');
    const preloadPath = path.join(outputDir, 'preload.js');

    const mainBackup = await fs.readFile(mainPath, 'utf-8');
    const preloadBackup = await fs.readFile(preloadPath, 'utf-8');

    console.log('✅ Backup original files\n');

    // 模擬：將 kebab-case 改回 camelCase 來測試自動修復
    console.log('🔄 Simulate naming style mismatch (change to camelCase)...\n');

    let mainContent = mainBackup.replace(/get-tasks/g, 'getTasks')
      .replace(/add-task/g, 'addTask')
      .replace(/update-task/g, 'updateTask')
      .replace(/delete-task/g, 'deleteTask')
      .replace(/reorder-tasks/g, 'reorderTasks');

    let preloadContent = preloadBackup.replace(/get-tasks/g, 'getTasks')
      .replace(/add-task/g, 'addTask')
      .replace(/update-task/g, 'updateTask')
      .replace(/delete-task/g, 'deleteTask')
      .replace(/reorder-tasks/g, 'reorderTasks');

    await fs.writeFile(mainPath, mainContent, 'utf-8');
    await fs.writeFile(preloadPath, preloadContent, 'utf-8');

    console.log('✅ Modified to camelCase\n');

    // 驗證契約（應該檢測到不一致）
    console.log('1️⃣ Validate contracts...\n');
    const validationResult = await validator.validateSession(testSessionId);

    if (validationResult.isValid) {
      console.log('⚠️  Validation passed, no issues detected');
    } else {
      console.log(`❌ Detected ${validationResult.issues.missingChannels?.length || 0} missing channels\n`);
    }

    // 自動修復
    console.log('2️⃣ Auto fix...\n');
    const fixResult = await fixer.autoFix(testSessionId, validationResult);
    const report = fixer.generateReport(fixResult);
    console.log(report);

    // 重新驗證
    console.log('3️⃣ Revalidate...\n');
    const revalidation = await validator.validateSession(testSessionId);

    if (revalidation.isValid) {
      console.log('✅ Fix successful! Contracts are consistent\n');
    } else {
      console.log('⚠️ Fix failed\n');
      console.log(validator.generateReport(revalidation));
    }

    console.log('═'.repeat(70));
    console.log('\n💡 Testing completed. Restoring original files...\n');

    // 恢復原始文件
    await fs.writeFile(mainPath, mainBackup, 'utf-8');
    await fs.writeFile(preloadPath, preloadBackup, 'utf-8');

    console.log('✅ Restored original files');

  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error(error.stack);
  }
}

testNamingStyleFix();
