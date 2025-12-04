/**
 * 測試 Contracts Agent 是否保留 template 欄位
 */

require('dotenv').config();
const ContractsAgent = require('./agents/coder-agent/contracts-agent.js');

async function testTemplatePreservation() {
  console.log('='.repeat(60));
  console.log('Testing Template Preservation in Contracts Agent');
  console.log('='.repeat(60));
  
  // 模擬包含 template 的 payload
  const mockPayload = {
    comment: "Test payload with templates",
    output: {
      coder_instructions: {
        task: "Create a calculator website",
        requirements: ["Basic arithmetic", "Responsive design"],
        files: [
          {
            path: "public/index.html",
            type: "markup",
            language: "html",
            description: "Main HTML file",
            template: "<!DOCTYPE html>\n<html>\n<head><title>Calculator</title></head>\n<body><h1>Original Template</h1></body>\n</html>"
          },
          {
            path: "public/script.js",
            type: "script",
            language: "javascript",
            description: "Main JavaScript file",
            template: "function calculate() {\n  console.log('Original template code');\n}"
          },
          {
            path: "public/style.css",
            type: "style",
            language: "css",
            description: "Main CSS file"
            // 這個檔案沒有 template
          }
        ],
        contracts: {
          dom: [
            { id: "display", type: "input", purpose: "Show result" }
          ],
          api: []
        },
        projectConfig: {
          backend: {
            port: 3000 // 這會被 AI 修正為 5001 或 3800
          }
        }
      }
    }
  };
  
  console.log('\n📥 BEFORE Processing:');
  console.log('Files with templates:', 
    mockPayload.output.coder_instructions.files
      .filter(f => f.template)
      .map(f => f.path)
  );
  mockPayload.output.coder_instructions.files.forEach(f => {
    if (f.template) {
      console.log(`  - ${f.path}: ${f.template.length} chars`);
    }
  });
  
  // 處理 payload
  const agent = new ContractsAgent();
  const enhanced = await agent.processPayload(mockPayload);
  
  console.log('\n📤 AFTER Processing:');
  console.log('Files with templates:', 
    enhanced.output.coder_instructions.files
      .filter(f => f.template)
      .map(f => f.path)
  );
  enhanced.output.coder_instructions.files.forEach(f => {
    if (f.template) {
      console.log(`  - ${f.path}: ${f.template.length} chars`);
    }
  });
  
  // 驗證結果
  console.log('\n🔍 Verification:');
  const beforeTemplates = mockPayload.output.coder_instructions.files.filter(f => f.template).length;
  const afterTemplates = enhanced.output.coder_instructions.files.filter(f => f.template).length;
  
  console.log(`Templates before: ${beforeTemplates}`);
  console.log(`Templates after: ${afterTemplates}`);
  
  if (beforeTemplates === afterTemplates) {
    console.log('✅ SUCCESS: All templates preserved!');
    
    // 檢查內容是否完全相同
    let allMatch = true;
    for (const originalFile of mockPayload.output.coder_instructions.files) {
      if (originalFile.template) {
        const enhancedFile = enhanced.output.coder_instructions.files.find(f => f.path === originalFile.path);
        if (!enhancedFile || enhancedFile.template !== originalFile.template) {
          console.log(`❌ Template content mismatch for ${originalFile.path}`);
          allMatch = false;
        }
      }
    }
    
    if (allMatch) {
      console.log('✅ Template contents are identical');
    }
  } else {
    console.log('❌ FAILURE: Templates were lost!');
  }
  
  // 檢查 port 是否被修正
  const originalPort = mockPayload.output.coder_instructions.projectConfig.backend.port;
  const enhancedPort = enhanced.output.coder_instructions.projectConfig.backend?.port;
  
  console.log(`\n🔧 Port Fix Verification:`);
  console.log(`Original port: ${originalPort}`);
  console.log(`Enhanced port: ${enhancedPort}`);
  
  if (enhancedPort && enhancedPort !== 3000) {
    console.log('✅ Port conflict fixed');
  } else {
    console.log('⚠️  Port might not be fixed (AI may have failed)');
  }
  
  console.log('\n' + '='.repeat(60));
}

testTemplatePreservation()
  .then(() => {
    console.log('Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
