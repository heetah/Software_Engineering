/**
 * 簡單測試參數檢測
 */
import ContractValidator from "./agents/contract-validator.js";

async function simpleTest() {
  console.log("測試參數格式分析功能\n");
  
  const validator = new ContractValidator();
  
  // 模擬提取的契約數據
  const mockContracts = {
    api: [
      {
        endpoint: 'save-note',
        parameterFormats: {
          'main.js': { type: 'object-destructure', raw: '{ filename, content }' },
          'preload.js': { type: 'multiple-params', count: 2, raw: 'filename, content' }
        }
      },
      {
        endpoint: 'load-note',
        parameterFormats: {
          'main.js': { type: 'object-destructure', raw: '{ filename }' },
          'preload.js': { type: 'single-param', count: 1, raw: 'filename' }
        }
      }
    ]
  };
  
  console.log("📊 模擬數據:");
  console.log(JSON.stringify(mockContracts, null, 2));
  
  console.log("\n🔍 執行參數一致性檢查...\n");
  const issues = validator.checkParameterConsistency(mockContracts);
  
  if (issues.length > 0) {
    console.log(`✅ 成功檢測到 ${issues.length} 個參數格式問題:\n`);
    for (const issue of issues) {
      console.log(`頻道: ${issue.endpoint}`);
      console.log(`  ${issue.file1}: ${validator.formatTypeDescription(issue.format1)}`);
      console.log(`  ${issue.file2}: ${validator.formatTypeDescription(issue.format2)}`);
      console.log(`  描述: ${issue.description}\n`);
    }
  } else {
    console.log("❌ 未檢測到問題（不應該發生）");
  }
}

simpleTest().catch(console.error);
