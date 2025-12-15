/**
 * 直接測試參數格式提取
 */
import ContractValidator from "./agents/contract-validator.js";
import fs from 'fs/promises';
import path from 'path';

const SESSION_ID = '814011e2-79a0-40c4-ac7e-401206374ece';

async function testExtraction() {
  console.log("=".repeat(60));
  console.log("測試參數格式提取");
  console.log("=".repeat(60));
  
  const outputDir = path.join(process.cwd(), 'output', SESSION_ID);
  
  // 讀取文件
  const mainContent = await fs.readFile(path.join(outputDir, 'main.js'), 'utf-8');
  const preloadContent = await fs.readFile(path.join(outputDir, 'preload.js'), 'utf-8');
  
  const files = [
    { path: `${SESSION_ID}/main.js`, content: mainContent },
    { path: `${SESSION_ID}/preload.js`, content: preloadContent }
  ];
  
  const validator = new ContractValidator();
  const extracted = await validator.extractContractsSimple(files);
  
  console.log("\n📊 提取的 API 契約:\n");
  
  for (const api of extracted.api) {
    console.log(`頻道: ${api.endpoint}`);
    console.log(`  來源: ${api.source}`);
    console.log(`  Producers: ${api.producers.join(', ')}`);
    console.log(`  Consumers: ${api.consumers.join(', ')}`);
    
    if (api.parameterFormats) {
      console.log(`  參數格式:`);
      for (const [file, format] of Object.entries(api.parameterFormats)) {
        console.log(`    ${file}: ${format.type} - ${format.raw}`);
      }
    }
    console.log();
  }
  
  // 測試參數一致性檢查
  console.log("\n🔍 檢查參數一致性...\n");
  const issues = validator.checkParameterConsistency(extracted);
  
  if (issues.length > 0) {
    console.log(`✅ 發現 ${issues.length} 個參數格式問題:`);
    for (const issue of issues) {
      console.log(`\n  頻道: ${issue.endpoint}`);
      console.log(`  ${issue.file1}: ${validator.formatTypeDescription(issue.format1)}`);
      console.log(`  ${issue.file2}: ${validator.formatTypeDescription(issue.format2)}`);
      console.log(`  描述: ${issue.description}`);
    }
  } else {
    console.log("❌ 沒有發現參數格式問題");
  }
}

testExtraction().catch(console.error);
