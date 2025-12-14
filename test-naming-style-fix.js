/**
 * 測試命名風格自動修復功能
 */

import ContractValidator from './agents/contract-validator.js';
import ContractAutoFixer from './agents/contract-auto-fixer.js';
import fs from 'fs/promises';
import path from 'path';

async function testNamingStyleFix() {
  console.log('🧪 測試命名風格自動修復\n');
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
    
    console.log('✅ 已備份原始文件\n');
    
    // 模擬：將 kebab-case 改回 camelCase 來測試自動修復
    console.log('🔄 模擬命名風格不一致（改為 camelCase）...\n');
    
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
    
    console.log('✅ 已修改為 camelCase\n');
    
    // 驗證契約（應該檢測到不一致）
    console.log('1️⃣ 驗證契約...\n');
    const validationResult = await validator.validateSession(testSessionId);
    
    if (validationResult.isValid) {
      console.log('⚠️  驗證通過，沒有檢測到問題');
    } else {
      console.log(`❌ 檢測到 ${validationResult.issues.missingChannels?.length || 0} 個缺失的頻道\n`);
    }
    
    // 自動修復
    console.log('2️⃣ 嘗試自動修復...\n');
    const fixResult = await fixer.autoFix(testSessionId, validationResult);
    const report = fixer.generateReport(fixResult);
    console.log(report);
    
    // 重新驗證
    console.log('3️⃣ 重新驗證...\n');
    const revalidation = await validator.validateSession(testSessionId);
    
    if (revalidation.isValid) {
      console.log('✅ 修復成功！契約完全一致\n');
    } else {
      console.log('⚠️  仍有問題未解決\n');
      console.log(validator.generateReport(revalidation));
    }
    
    console.log('═'.repeat(70));
    console.log('\n💡 測試完成。正在恢復原始文件...\n');
    
    // 恢復原始文件
    await fs.writeFile(mainPath, mainBackup, 'utf-8');
    await fs.writeFile(preloadPath, preloadBackup, 'utf-8');
    
    console.log('✅ 已恢復原始文件');
    
  } catch (error) {
    console.error('❌ 測試失敗:', error);
    console.error(error.stack);
  }
}

testNamingStyleFix();
