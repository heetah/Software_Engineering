/**
 * Coordinator 主程式
 * 負責初始化所有 agent、管理 agent 生命週期、處理使用者輸入等功能
 */

// dotenv 配置環境變數
import dotenv from "dotenv";
dotenv.config();

// 引入統一配置
import { config } from "./utils/config.js";

import ArchitectAgent from "./agents/architect-agent.js";
import VerifierAgent from "./agents/verifier-agent.js";
import TesterAgent from "./agents/tester-agent.js";
import ContractValidator from "./agents/contract-validator.js";
import ContractAutoFixer from "./agents/contract-auto-fixer.js";
import ContractRepairAgent from "./agents/contract-repair-agent.js";
// 將 Coder 產出的 Markdown 生成專案
import { writeProjectFromMarkdown } from "./agents/project-writer.js";
// Gemini Service for AI-powered repairs
import { askGemini } from "./services/gemini.js";
// InstructionService 用於會話管理和結構化計劃生成
import InstructionService from "./agents/instruction-service.js";
// Coder Agent Coordinator（CommonJS 模組）
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
// 錯誤處理和工具
import { CoordinatorError } from "./utils/errors.js";
import { withErrorHandling, errorLogger } from "./utils/error-handler.js";
import { tokenTracker } from "./utils/token-tracker.js";

// 載入 CommonJS 模組
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const CoderCoordinator = require("./agents/coder-agent/coordinator.cjs");

// Agent 生命週期管理 - 單例模式
let agentCache = null;

/**
 * 初始化 agents 的輔助函數（帶緩存機制）
 * @param {boolean} force - 是否強制重新初始化
 * @returns {Object} Agents 物件
 */
export function initializeAgents(force = false) {
  if (!force && agentCache) {
    return agentCache;
  }

  agentCache = {
    architect: new ArchitectAgent(),
    verifier: new VerifierAgent(),
    tester: new TesterAgent(),
    // Coder 功能由 agents/coder-agent/coordinator.js 負責
    // 使用時動態創建 Coordinator 實例
    coderCoordinator: null
  };

  return agentCache;
}

/**
 * 獲取或創建 Coder Coordinator 實例
 */
// Rename parameter to avoid shadowing global config
export function getCoderCoordinator(options = {}) {
  if (!agentCache) {
    agentCache = initializeAgents(true);
  }

  const requestedProvider = (options.llmProvider || "auto").toLowerCase();
  const apiKeys = options.apiKeys || {};

  // 每次依據目前設定建立新的 CoderCoordinator，確保 API Key / Provider 最新
  agentCache.coderCoordinator = new CoderCoordinator({
    useMockApi: options.useMockApi || false,
    llmProvider: requestedProvider,
    geminiApiKey: apiKeys.gemini || null,
    openaiApiKey: apiKeys.openai || null,
    // 傳遞統一的超時設定 (解決 worker 無法獲取 config 的問題)
    timeout: config.api.timeout,
  });

  return agentCache.coderCoordinator;
}

async function main() {
  console.log(" Multi-Agent Coordinator Started");

  // Get user input and mode selection
  const args = process.argv.slice(2);
  const userInput = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-")).join(" ");

  if (!userInput) {
    console.log("Usage:");
    console.log("  node Coordinator.js <user requirement>");
    process.exit(1);
  }

  // 初始化所有 agent
  const agents = initializeAgents();
  return await runWithInstructionService(userInput, agents);
}

/**
 * 使用 InstructionService 的流程
 * 可被外部調用來處理使用者輸入
 */
export async function runWithInstructionService(
  userInput,
  agents,
  options = {}
) {
  let { architect, verifier, tester } = agents;
  const { onLog } = options;

  const logProgress = (message) => {
    console.log(message);
    if (typeof onLog === 'function') {
      onLog(message);
    }
  };

  // 如果提供了動態選項 (API Keys / Provider)，重新實例化 Verifier 和 Tester 以應用設定
  if (options && (options.apiKeys || options.llmProvider)) {
    verifier = new VerifierAgent(options);
    tester = new TesterAgent(options);
  }

  // Update global config with user options (Dynamic Config)
  config.update(options);

  try {
    // 初始化 InstructionService（Architect Agent 會直接處理用戶需求）
    const instructionService = await withErrorHandling(
      'InstructionService',
      () => Promise.resolve(new InstructionService(options)), // Pass options containing apiKeys/llmProvider
      { userInput }
    );

    // （不再需要 Requirement Agent，Architect Agent 會同時處理需求分析和架構設計）
    const plan = await withErrorHandling(
      'InstructionService.createPlan',
      async () => {
        logProgress(`[Coordinator] Analyzing requirements and creating plan...`);
        return await instructionService.createPlan({
          prompt: userInput,
          context: {
            timestamp: new Date().toISOString()
          }
        });
      },
      { userInput }
    );

    // 如果是「單純問答模式」，直接回傳，不觸發後續 coder / verifier / tester
    if (plan && plan.mode === 'qa') {
      console.log("\nInstructionService QA mode: skip project generation / verifier / tester");
      return plan;
    }

    logProgress(`\nPlan created, Session ID: ${plan.id}`);
    console.log(`Workspace directory: ${plan.workspaceDir || 'N/A'}`);
    console.log(`File operations: Created=${plan.fileOps.created.length}, Skipped=${plan.fileOps.skipped.length}, Errors=${plan.fileOps.errors.length}`);

    // Display Token usage statistics
    const tokenStats = tokenTracker.getStats();
    console.log(`\nToken usage: ${tokenStats.total} (Remaining: ${tokenStats.remaining}, ${tokenStats.percentage})`);

    // Display plan summary
    if (plan.output?.plan) {
      console.log(`\nPlan title: ${plan.output.plan.title}`);
      console.log(`Plan summary: ${plan.output.plan.summary}`);
      console.log(`Steps: ${plan.output.plan.steps?.length || 0}`);
    }

    // If there are coder_instructions, optionally execute
    if (plan.output?.coder_instructions?.markdown) {
      console.log("\n--- Coder Instructions ---");
      console.log(plan.output.coder_instructions.markdown);
    }

    // 如果需要，使用 Coder Coordinator 生成代碼
    // 嘗試從 output 中提取 coder_instructions（可能直接存在，或包裹在 markdown 中）
    let coderInstructions = plan.output?.coder_instructions;

    // 如果 coder_instructions 不存在，嘗試從 markdown 中提取
    if (!coderInstructions && plan.output?.markdown) {
      try {
        // 嘗試從 markdown 中解析 JSON
        const markdownContent = plan.output.markdown;
        const jsonMatch = markdownContent.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
          markdownContent.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
          let jsonStr = jsonMatch[1] || jsonMatch[0];
          jsonStr = jsonStr.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
          const parsed = JSON.parse(jsonStr);

          if (parsed.coder_instructions) {
            coderInstructions = parsed.coder_instructions;
            console.log("  Extracted coder_instructions from markdown");
          }
        }
      } catch (e) {
        console.warn(" Failed to extract coder_instructions from markdown:", e.message);
      }
    }

    if (coderInstructions) {
      const coderCoordinator = getCoderCoordinator({
        useMockApi: false,
        llmProvider: options.llmProvider || "auto",
        apiKeys: options.apiKeys || {},
      });
      const requestId = `coordinator-${plan.id}`;

      // 構建 Coordinator 需要的 payload 格式
      const coordinatorPayload = {
        output: {
          coder_instructions: coderInstructions
        }
      };

      const coderResult = await withErrorHandling(
        'CoderCoordinator.generateFromArchitectPayload',
        () => coderCoordinator.generateFromArchitectPayload(coordinatorPayload, requestId),
        { planId: plan.id }
      );



      // 直接寫入檔案系統（Cursor 常用方式）
      try {
        logProgress(`[Coordinator] Generating project files...`);
        const result = await withErrorHandling(
          'writeProjectDirectly',
          () => Promise.resolve(
            writeProjectDirectly(coderResult, plan.workspaceDir || "./output/generated_project")
          ),
          { workspaceDir: plan.workspaceDir }
        );
        logProgress(`\nProject generated at ${result.outDir}`);
        console.log(`Total files: ${result.files.length}`);
        console.log(`\nGenerated files:`);
        result.files.forEach(file => {
          console.log(`  ${file}`);
        });
      } catch (e) {
        errorLogger.warn("Failed to generate project", { error: e.message, workspaceDir: plan.workspaceDir });
        // Fallback to Markdown method
        try {
          const markdown = formatCoderResultAsMarkdown(coderResult);
          const fallbackResult = await withErrorHandling(
            'writeProjectFromMarkdown (fallback)',
            () => Promise.resolve(
              writeProjectFromMarkdown(markdown, plan.workspaceDir || "./output/generated_project")
            ),
            { workspaceDir: plan.workspaceDir }
          );
          console.log(`\nProject generated (fallback) at ${fallbackResult.outDir}, files: ${fallbackResult.files.length}`);
        } catch (fallbackError) {
          errorLogger.error("Both direct write and Markdown fallback failed", {
            directError: e.message,
            fallbackError: fallbackError.message
          });
        }
      }

      // ===== Contract Validation & Auto-Fix: 驗證並自動修復契約不一致 =====
      logProgress("\n" + "=".repeat(60));
      logProgress("Contract Validator: Checking & Auto-Fixing contracts");
      logProgress("=".repeat(60));

      try {
        const contractValidator = new ContractValidator();
        const contractAutoFixer = new ContractAutoFixer();

        // 第一層：快速程式化驗證和修復
        const checkResult = await withErrorHandling(
          'ContractAutoFixer.checkAndFix',
          () => contractAutoFixer.checkAndFix(plan.id, contractValidator),
          { sessionId: plan.id }
        );

        if (checkResult.fixResult) {
          console.log(`\n📊 程式化修復結果: 成功 ${checkResult.fixResult.successCount}，失敗 ${checkResult.fixResult.failCount}`);
        }

        // 第二層：AI 深度修復（無論程式化修復是否成功都執行）
        console.log("\n" + "=".repeat(60));
        console.log("🤖 AI Contract Repair: 深度分析並修復");
        console.log("=".repeat(60));

        // 重新驗證以獲取最新問題
        const finalValidation = await contractValidator.validateSession(plan.id);

        if (!finalValidation.isValid || checkResult.needsAI) {
          // 創建一個簡單的 GeminiService 包裝
          const geminiService = {
            generateContent: async (prompt) => {
              const result = await askGemini(prompt);
              if (!result.ok) {
                throw new Error(result.error || 'Gemini API error');
              }
              return { response: { text: () => result.response } };
            }
          };

          const contractRepairAgent = new ContractRepairAgent(geminiService);

          const repairResult = await withErrorHandling(
            'ContractRepairAgent.repair',
            () => contractRepairAgent.repair(plan.id, finalValidation),
            { sessionId: plan.id }
          );

          if (repairResult.success) {
            console.log("\n✅ AI 修復完成！");
            console.log(`   修復文件數: ${repairResult.summary.fixedFileCount}`);
            console.log(`   總變更數: ${repairResult.summary.totalChanges}`);
            console.log(`   修復的文件: ${repairResult.summary.files.join(', ')}\n`);

            // 最終驗證
            const postRepairValidation = await contractValidator.validateSession(plan.id);
            if (postRepairValidation.isValid) {
              console.log("🎉 最終驗證通過！專案契約完全一致！\n");
            } else {
              console.log("⚠️  仍有少量問題，但已大幅改善\n");
              const report = contractValidator.generateReport(postRepairValidation);
              console.log(report);
            }
          } else {
            console.log("\n⚠️  AI 修復失敗，請檢查錯誤訊息\n");
          }
        } else {
          console.log("\n✅ 專案契約完全一致，無需 AI 修復！\n");
          const validationReport = contractValidator.generateReport(finalValidation);
          console.log(validationReport);
        }

      } catch (validationError) {
        errorLogger.warn("Contract validation/repair failed", {
          error: validationError.message,
          sessionId: plan.id
        });
      }
    }

    // ===== Verifier Agent: 生成測試計劃 =====
    logProgress("\n" + "=".repeat(60));
    logProgress("Verifier Agent: Generate test plan");
    logProgress("=".repeat(60));

    let testPlan = null;
    try {
      const verifierResult = await withErrorHandling(
        'VerifierAgent.runVerifierAgent',
        () => verifier.runVerifierAgent(plan.id),
        { sessionId: plan.id }
      );
      testPlan = verifierResult.plan;
      console.log(`Test Plan generated: ${verifierResult.path}`);
      console.log(`Test files: ${testPlan?.testFiles?.length || 0}`);

      if (testPlan?.testFiles && testPlan.testFiles.length > 0) {
        testPlan.testFiles.forEach(tf => {
          console.log(`  - ${tf.filename} (${tf.testLevel}, ${tf.inputsType})`);
        });
      }
    } catch (err) {
      errorLogger.warn("Verifier Agent execution failed", {
        error: err.message,
        sessionId: plan.id
      });
      console.warn(`\nVerifier Agent execution failed: ${err.message}`);
      console.warn("   Test Plan generation skipped, but project generation completed");
    }

    // ===== Tester Agent: 生成測試碼並執行測試 =====
    if (testPlan && testPlan.testFiles && testPlan.testFiles.length > 0) {
      logProgress("\n" + "=".repeat(60));
      logProgress("Tester Agent: Generate test code and execute tests");
      logProgress("=".repeat(60));

      try {
        const testResult = await withErrorHandling(
          'TesterAgent.runTesterAgent',
          () => tester.runTesterAgent(plan.id),
          { sessionId: plan.id }
        );

        const { testReport, errorReport } = testResult;
        console.log(`\nTests executed successfully!`);
        console.log(`Test statistics:`);
        console.log(`   - Test files: ${testReport.totals.files}`);
        console.log(`   - Total tests: ${testReport.totals.tests}`);
        console.log(`   - Passed: ${testReport.totals.passed}`);
        console.log(`   - Failed: ${testReport.totals.failed} ${testReport.totals.failed > 0 ? '' : ''}`);

        if (testReport.totals.failed > 0) {
          console.log(`\nThere are ${testReport.totals.failed} failed tests`);
          if (errorReport.failures && errorReport.failures.length > 0) {
            console.log(`\nFailed case details:`);
            errorReport.failures.slice(0, 5).forEach((failure, idx) => {
              console.log(`  ${idx + 1}. ${failure.title}`);
              console.log(`     File: ${failure.filename}`);
              if (failure.failureMessages && failure.failureMessages[0]) {
                const msg = failure.failureMessages[0].substring(0, 100);
                console.log(`     Error: ${msg}${failure.failureMessages[0].length > 100 ? '...' : ''}`);
              }
            });
            if (errorReport.failures.length > 5) {
              console.log(`  ... There are ${errorReport.failures.length - 5} more failed cases`);
            }
          }
        } else {
          console.log(`\nAll tests passed!`);
        }

        // 將測試結果添加到 plan 中
        plan.testReport = testReport;
        plan.errorReport = errorReport;
      } catch (err) {
        errorLogger.warn("Tester Agent execution failed", {
          error: err.message,
          sessionId: plan.id
        });
        console.warn(`\nTester Agent execution failed: ${err.message}`);
        console.warn("   Test execution skipped, but project and test plan generated");
      }
    } else {
      console.log("\nSkipped Tester Agent: No test files available");
    }

    console.log("\nInstructionService process completed!");
    console.log(`\nTip: Use the following commands to view session details:`);
    console.log(`  const service = new InstructionService();`);
    console.log(`  const session = service.getSession('${plan.id}');`);

    return plan;
  } catch (err) {
    // 使用統一的錯誤處理
    errorLogger.log(err, { userInput });

    // 如果是自定義錯誤，直接拋出
    if (err instanceof CoordinatorError) {
      throw err;
    }

    // Otherwise wrap as CoordinatorError
    throw new CoordinatorError(
      "Process execution failed",
      "Coordinator",
      err,
      { userInput }
    );
  }
}

/**
 * 直接寫入檔案系統（Cursor 常用方式）
 * 不通過 Markdown 轉換，直接從 result.files 寫入
 */
function writeProjectDirectly(result, outDir = "./output/generated_project") {
  if (!result || !result.files || !Array.isArray(result.files)) {
    throw new Error("Invalid coder result: missing files array");
  }

  // 確保輸出目錄存在
  fs.mkdirSync(outDir, { recursive: true });

  const writtenFiles = [];
  const errors = [];

  // 直接寫入每個檔案
  result.files.forEach(file => {
    try {
      if (!file.path) {
        errors.push({ file: file, error: "Missing file path" });
        return;
      }

      const filePath = path.join(outDir, file.path);
      const fileDir = path.dirname(filePath);

      // 確保目錄存在
      if (fileDir !== outDir) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      // 獲取檔案內容
      const content = file.template || file.content || "";

      if (!content || content.trim() === "") {
        errors.push({ file: file.path, error: "Empty content" });
        return;
      }

      // 寫入檔案
      fs.writeFileSync(filePath, content, "utf8");
      writtenFiles.push(filePath);

    } catch (error) {
      errors.push({ file: file.path || "unknown", error: error.message });
    }
  });

  // 如果有錯誤，記錄但不中斷
  if (errors.length > 0) {
    console.warn(`\n  ${errors.length} file(s) failed to write:`);
    errors.forEach(({ file, error }) => {
      console.warn(`  - ${file}: ${error}`);
    });
  }

  return {
    outDir,
    files: writtenFiles,
    total: result.files.length,
    successful: writtenFiles.length,
    failed: errors.length
  };
}

/**
 * 將 Coder Coordinator 的結果格式化為 Markdown
 */
function formatCoderResultAsMarkdown(result) {
  let markdown = "# Generated project files\n\n";

  if (result.notes && result.notes.length > 0) {
    markdown += "## Description\n\n";
    result.notes.forEach(note => {
      markdown += `- ${note}\n`;
    });
    markdown += "\n";
  }

  if (result.files && result.files.length > 0) {
    result.files.forEach(file => {
      markdown += `<!-- file: ${file.path} -->\n`;
      markdown += `\`\`\`${file.language || "text"}\n`;
      markdown += file.template || file.content || "";
      markdown += `\n\`\`\`\n\n`;
    });
  }

  return markdown;
}

// 只在直接執行此檔案時才運行 main()，而不是在被導入時
// 檢查是否為直接執行（不是被 import 導入）
// 如果 process.argv[1] 存在且包含 Coordinator.js，且不在 Electron 環境中，則執行
if (typeof process !== 'undefined' && process.argv && process.argv[1]) {
  const scriptPath = process.argv[1].replace(/\\/g, '/');
  const isElectron = typeof process !== 'undefined' && process.versions && process.versions.electron;
  const isCoordinatorScript = scriptPath.includes('Coordinator.js') || scriptPath.endsWith('Coordinator.js');

  // 只在非 Electron 環境且直接執行 Coordinator.js 時才運行 main()
  if (isCoordinatorScript && !isElectron) {
    main().catch(err => console.error("Coordinator Error:", err));
  }
}
