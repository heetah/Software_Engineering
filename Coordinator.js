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
  const requirement = new RequirementAgent();
  const architect = new ArchitectAgent();
  const coder = new CoderAgent();
  const tester = new TesterAgent();

  return await runWithInstructionService(userInput, { requirement, architect, coder, tester });
}

/**
 * 使用 InstructionService 的流程
 */
async function runWithInstructionService(userInput, agents) {
  const { requirement, architect, coder, tester } = agents;

  // 初始化 InstructionService
  const instructionService = new InstructionService();

  // Requirement Agent - 分析需求
  const reqPrompt = requirement.prompt(userInput);
  const requirementOutput = await requirement.run(reqPrompt);

  try {
    // 使用 InstructionService 創建計劃
    const plan = await instructionService.createPlan({
      prompt: userInput,
      context: {
        requirementOutput,
        timestamp: new Date().toISOString()
      }
    });

    console.log(`\n計劃已創建，會話 ID: ${plan.id}`);
    console.log(`工作區目錄: ${plan.workspaceDir || 'N/A'}`);
    console.log(`檔案操作: 創建=${plan.fileOps.created.length}, 跳過=${plan.fileOps.skipped.length}, 錯誤=${plan.fileOps.errors.length}`);

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
      const coderOutput = await coder.generateProject(plan.output.coder_instructions.markdown || JSON.stringify(plan.output, null, 2));
      
      try {
        const result = writeProjectFromMarkdown(coderOutput, plan.workspaceDir || "./generated_project");
        console.log(`\n 已生成專案於 ${result.outDir}，檔案數：${result.files.length}`);
      } catch (e) {
        console.warn(" 生成專案失敗：", e.message);
      }
    }

    console.log("\n✅ InstructionService 流程完成！");
    console.log(`\n提示: 使用以下命令查看會話詳情:`);
    console.log(`  const service = new InstructionService();`);
    console.log(`  const session = service.getSession('${plan.id}');`);

    return plan;
  } catch (err) {
    console.error("InstructionService 錯誤:", err);
    throw err;
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

main().catch(err => console.error("Coordinator Error:", err));
