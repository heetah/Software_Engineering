// dotenv 配置環境變數
import dotenv from "dotenv";
dotenv.config();

import RequirementAgent from "./agents/requirement-agent.js";
import ArchitectAgent from "./agents/architect-agent.js";
import CoderAgent from "./agents/coder-agent.js";
import TesterAgent from "./agents/tester-agent.js";
// 將 Coder 產出的 Markdown 生成專案
import { writeProjectFromMarkdown } from "./agents/project-writer.js";
// InstructionService 用於會話管理和結構化計劃生成
import InstructionService from "./agents/instructionService.js";
// 錯誤處理和工具
import { CoordinatorError } from "./utils/errors.js";
import { withErrorHandling, errorLogger } from "./utils/error-handler.js";
import { tokenTracker } from "./utils/token-tracker.js";

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
    requirement: new RequirementAgent(),
    architect: new ArchitectAgent(),
    coder: new CoderAgent(),
    tester: new TesterAgent()
  };
  
  return agentCache;
}

async function main() {
  console.log(" Multi-Agent Coordinator Started");

  // 獲取用戶輸入和模式選擇
  const args = process.argv.slice(2);
  const userInput = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-")).join(" ");

  if (!userInput) {
    console.log("使用方法:");
    console.log("  node Coordinator.js <用戶需求>");
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
export async function runWithInstructionService(userInput, agents) {
  const { requirement, architect, coder, tester } = agents;

  try {
    // 初始化 InstructionService
    const instructionService = await withErrorHandling(
      'InstructionService',
      () => Promise.resolve(new InstructionService()),
      { userInput }
    );

    // Requirement Agent - 分析需求
    const requirementOutput = await withErrorHandling(
      'RequirementAgent',
      async () => {
        const reqPrompt = requirement.prompt(userInput);
        return await requirement.run(reqPrompt);
      },
      { userInput }
    );

    // 使用 InstructionService 創建計劃
    const plan = await withErrorHandling(
      'InstructionService.createPlan',
      () => instructionService.createPlan({
        prompt: userInput,
        context: {
          requirementOutput,
          timestamp: new Date().toISOString()
        }
      }),
      { userInput, requirementOutput }
    );

    console.log(`\n計劃已創建，會話 ID: ${plan.id}`);
    console.log(`工作區目錄: ${plan.workspaceDir || 'N/A'}`);
    console.log(`檔案操作: 創建=${plan.fileOps.created.length}, 跳過=${plan.fileOps.skipped.length}, 錯誤=${plan.fileOps.errors.length}`);

    // 顯示 Token 使用統計
    const tokenStats = tokenTracker.getStats();
    console.log(`\n📊 Token 使用統計: ${tokenStats.total} (剩餘: ${tokenStats.remaining}, ${tokenStats.percentage})`);

    // 顯示計劃摘要
    if (plan.output?.plan) {
      console.log(`\n計劃標題: ${plan.output.plan.title}`);
      console.log(`計劃摘要: ${plan.output.plan.summary}`);
      console.log(`步驟數: ${plan.output.plan.steps?.length || 0}`);
    }

    // 如果有 coder_instructions，可以選擇執行
    if (plan.output?.coder_instructions?.markdown) {
      console.log("\n--- Coder 指令 ---");
      console.log(plan.output.coder_instructions.markdown);
    }

    // 如果需要，可以繼續使用 Coder Agent 生成代碼
    if (plan.output?.coder_instructions) {
      const coderOutput = await withErrorHandling(
        'CoderAgent.generateProject',
        () => coder.generateProject(
          plan.output.coder_instructions.markdown || JSON.stringify(plan.output, null, 2)
        ),
        { planId: plan.id }
      );
      
      try {
        const result = await withErrorHandling(
          'writeProjectFromMarkdown',
          () => Promise.resolve(
            writeProjectFromMarkdown(coderOutput, plan.workspaceDir || "./generated_project")
          ),
          { workspaceDir: plan.workspaceDir }
        );
        console.log(`\n 已生成專案於 ${result.outDir}，檔案數：${result.files.length}`);
      } catch (e) {
        errorLogger.warn("生成專案失敗", { error: e.message, workspaceDir: plan.workspaceDir });
      }
    }

    console.log("\n✅ InstructionService 流程完成！");
    console.log(`\n提示: 使用以下命令查看會話詳情:`);
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
    
    // 否則包裝為 CoordinatorError
    throw new CoordinatorError(
      "流程執行失敗",
      "Coordinator",
      err,
      { userInput }
    );
  }
}

/**
 * 原有的傳統流程
 */
async function runTraditionalFlow(userInput, agents) {
  const { requirement, architect, coder, tester } = agents;

  // Requirement Agent
  const reqPrompt = requirement.prompt(userInput);
  const requirementOutput = await requirement.run(reqPrompt);

  // Architecture Agent
  const archPrompt = architect.prompt(requirementOutput);
  const architectOutput = await architect.run(archPrompt);

  // Coder Agent
  console.log("\n開始分批生成專案檔案...");
  const archSummary = architectOutput.length > 6000 
    ? architectOutput.substring(0, 6000) + "\n... [內容已截斷]"
    : architectOutput;
  const coderOutput = await coder.generateProject(archSummary);

  // 將 Coder 產出的 Markdown 生成專案
  try {
    const result = writeProjectFromMarkdown(coderOutput, "./generated_project");
    console.log(`\n 已生成專案於 ${result.outDir}，檔案數：${result.files.length}`);
  } catch (e) {
    console.warn(" 生成專案失敗：", e.message);
  }

  // Tester Agent
  const testPrompt = tester.prompt(coderOutput);
  const testerOutput = await tester.run(testPrompt);

  console.log("\n All tasks completed successfully!");
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
