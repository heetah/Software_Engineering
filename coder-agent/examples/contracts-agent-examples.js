/**
 * Contracts Agent 使用範例和整合指南
 */

const ContractsAgent = require('../contracts-agent');

// ============================================
// 使用範例 1: 基本用法
// ============================================

async function example1_basicUsage() {
    const agent = new ContractsAgent();
    
    // 原始 payload（可能缺少關鍵配置）
    const originalPayload = {
        description: "Full-stack Todo app with Flask backend and Vanilla JS frontend",
        files: [
            { path: "server.py", agent: "Server Agent" },
            { path: "app.js", agent: "Script Agent" }
        ],
        contracts: {
            api: [
                {
                    endpoint: "/api/auth/login",
                    method: "POST",
                    request: { username: "string", password: "string" },
                    response: { token: "string" }
                }
            ]
        }
    };
    
    // 自動分析和增強
    const enhancedPayload = await agent.processPayload(originalPayload);
    
    console.log('\n✅ Enhanced Payload:');
    console.log(JSON.stringify(enhancedPayload, null, 2));
    
    return enhancedPayload;
}

// ============================================
// 使用範例 2: 整合到 Coder Agent
// ============================================

async function example2_integrateWithCoderAgent(userPayload) {
    const agent = new ContractsAgent();
    
    // Step 1: 預處理 payload
    console.log('🔄 Step 1: Pre-processing payload with Contracts Agent...');
    const enhancedPayload = await agent.processPayload(userPayload);
    
    // Step 2: 傳遞給 Architecture Adapter
    console.log('🔄 Step 2: Passing to Architecture Adapter...');
    // const architecturePlan = architectureAdapter.process(enhancedPayload);
    
    // Step 3: 各個 Agent 使用增強後的 payload 生成代碼
    console.log('🔄 Step 3: Generating code with enhanced specifications...');
    // const generatedCode = await coderAgents.generate(architecturePlan);
    
    return enhancedPayload;
}

// ============================================
// 使用範例 3: 手動檢查模式（不自動修復）
// ============================================

async function example3_manualCheckMode() {
    const agent = new ContractsAgent();
    
    const payload = {
        description: "Flask API with JWT auth",
        files: [{ path: "server.py", agent: "Server Agent" }]
    };
    
    // 只檢測問題，不自動修復
    const issues = agent.detectIssues(payload);
    
    console.log('\n⚠️ Issues Found:');
    console.log('Critical:', issues.critical.length);
    console.log('Warnings:', issues.warnings.length);
    console.log('Suggestions:', issues.suggestions.length);
    
    // 讓用戶選擇是否應用修復
    const shouldApply = true; // 從 UI 獲取用戶選擇
    
    if (shouldApply) {
        const enhancements = agent.generateEnhancements(payload, issues);
        const enhanced = agent.applyEnhancements(payload, enhancements);
        return enhanced;
    }
    
    return payload;
}

// ============================================
// 使用範例 4: 自定義規則
// ============================================

class CustomContractsAgent extends ContractsAgent {
    constructor() {
        super();
        // 添加自定義檢測規則
        this.customRules = [
            this.checkDatabaseMigrations.bind(this),
            this.checkTestCoverage.bind(this),
            this.checkDocumentation.bind(this)
        ];
    }
    
    detectIssues(payload) {
        const issues = super.detectIssues(payload);
        
        // 執行自定義規則
        this.customRules.forEach(rule => {
            const customIssues = rule(payload);
            this.mergeIssues(issues, customIssues);
        });
        
        return issues;
    }
    
    checkDatabaseMigrations(payload) {
        const issues = { critical: [], warnings: [], suggestions: [] };
        
        const hasDatabase = this.searchInPayload(payload, ['database', 'db', 'sqlalchemy', 'mongoose']);
        const hasMigrations = this.searchInPayload(payload, ['migration', 'alembic', 'init_db']);
        
        if (hasDatabase && !hasMigrations) {
            issues.suggestions.push({
                id: 'missing_migrations',
                message: 'Database detected but no migration script specified',
                suggestion: 'Add init_db.py or migration setup',
                autoFix: true
            });
        }
        
        return issues;
    }
    
    checkTestCoverage(payload) {
        // 檢查是否有測試相關配置
        return { critical: [], warnings: [], suggestions: [] };
    }
    
    checkDocumentation(payload) {
        // 檢查是否有 README 和文檔
        return { critical: [], warnings: [], suggestions: [] };
    }
}

// ============================================
// 整合到現有工作流程
// ============================================

/**
 * 在 coder-agent-cli.js 中的整合點
 */
async function integrateIntoWorkflow(payloadPath) {
    const fs = require('fs');
    const path = require('path');
    
    // 1. 讀取原始 payload
    const originalPayload = JSON.parse(fs.readFileSync(payloadPath, 'utf-8'));
    console.log('📄 Original payload loaded from:', payloadPath);
    
    // 2. 執行 Contracts Agent 預處理
    const agent = new ContractsAgent();
    const enhancedPayload = await agent.processPayload(originalPayload);
    
    // 3. 保存增強後的 payload（可選）
    const enhancedPath = payloadPath.replace('.json', '.enhanced.json');
    fs.writeFileSync(enhancedPath, JSON.stringify(enhancedPayload, null, 2));
    console.log('💾 Enhanced payload saved to:', enhancedPath);
    
    // 4. 繼續原有的 Coder Agent 流程
    // const result = await coderAgent.generate(enhancedPayload);
    
    return enhancedPayload;
}

/**
 * CLI 命令範例
 */
function cliExample() {
    // 添加新的 CLI 選項
    const yargs = require('yargs');
    
    yargs.command({
        command: 'preprocess <payload>',
        describe: 'Pre-process payload with Contracts Agent',
        builder: {
            payload: {
                describe: 'Path to payload JSON file',
                type: 'string'
            },
            output: {
                describe: 'Output path for enhanced payload',
                type: 'string',
                default: null
            },
            'auto-fix': {
                describe: 'Automatically apply fixes',
                type: 'boolean',
                default: true
            }
        },
        handler: async (argv) => {
            const agent = new ContractsAgent();
            const payload = require(path.resolve(argv.payload));
            
            const enhanced = await agent.processPayload(payload);
            
            const outputPath = argv.output || argv.payload.replace('.json', '.enhanced.json');
            fs.writeFileSync(outputPath, JSON.stringify(enhanced, null, 2));
            
            console.log(`✅ Enhanced payload saved to: ${outputPath}`);
        }
    });
}

// ============================================
// 配置檔案範例
// ============================================

const contractsAgentConfig = {
    // 啟用/禁用特定檢查
    checks: {
        portConflict: true,
        jwtConfiguration: true,
        fieldNaming: true,
        viewSwitching: true,
        errorHandling: true,
        virtualEnvironment: true
    },
    
    // 自動修復設定
    autoFix: {
        enabled: true,
        criticalOnly: false, // false = 修復所有，true = 只修復 critical
        requireConfirmation: false
    },
    
    // 端口配置
    ports: {
        avoid: [3000], // 避免使用的端口
        recommend: 5001 // 推薦使用的端口
    },
    
    // 命名規範
    namingConventions: {
        api: 'snake_case', // API 字段使用 snake_case
        frontend: 'camelCase', // 前端變數使用 camelCase（但 API 字段仍用 snake_case）
        database: 'snake_case'
    },
    
    // 自定義規則
    customRules: []
};

// ============================================
// 測試用例
// ============================================

async function runTests() {
    console.log('🧪 Running Contracts Agent Tests...\n');
    
    // Test 1: Port conflict detection
    const test1 = {
        description: "Flask app on port 3000",
        projectConfig: { runtime: { backend_port: 3000 } }
    };
    
    const agent = new ContractsAgent();
    const enhanced1 = await agent.processPayload(test1);
    console.assert(
        enhanced1.projectConfig.runtime.backend_port !== 3000,
        'Test 1 Failed: Port should be changed from 3000'
    );
    console.log('✅ Test 1 Passed: Port conflict detected and fixed');
    
    // Test 2: JWT identity type
    const test2 = {
        description: "Flask app with JWT authentication",
        files: [{ path: "server.py", content: "create_access_token(identity=user.id)" }]
    };
    
    const enhanced2 = await agent.processPayload(test2);
    console.assert(
        enhanced2.technicalRequirements?.some(req => 
            req.category === 'JWT Authentication'
        ),
        'Test 2 Failed: JWT requirements should be added'
    );
    console.log('✅ Test 2 Passed: JWT requirements added');
    
    // Test 3: Field naming
    const test3 = {
        contracts: {
            api: [{
                endpoint: "/api/tasks",
                response: { 
                    tasks: [{ taskId: "number", dueDate: "string" }] 
                }
            }]
        }
    };
    
    const enhanced3 = await agent.processPayload(test3);
    const namingIssues = agent.checkFieldNaming(test3);
    console.assert(
        namingIssues.length > 0,
        'Test 3 Failed: Should detect camelCase in API response'
    );
    console.log('✅ Test 3 Passed: Field naming issues detected');
    
    console.log('\n🎉 All tests passed!');
}

// ============================================
// 導出
// ============================================

module.exports = {
    ContractsAgent,
    CustomContractsAgent,
    integrateIntoWorkflow,
    example1_basicUsage,
    example2_integrateWithCoderAgent,
    example3_manualCheckMode,
    contractsAgentConfig,
    runTests
};

// 如果直接執行此文件，運行示例
if (require.main === module) {
    (async () => {
        console.log('🚀 Contracts Agent Examples\n');
        await example1_basicUsage();
        // await runTests();
    })();
}
