// dotenv 配置環境變數
import dotenv from "dotenv";
dotenv.config();

import RequirementAgent from "./agents/requirement-agent.js";
import ArchitectAgent from "./agents/architect-agent.js";
import CoderAgent from "./agents/coder-agent.js";
import TesterAgent from "./agents/tester-agent.js";
// 將 Coder 產出的 Markdown 生成專案
import { writeProjectFromMarkdown } from "./agents/project-writer.js";

async function main() {
  console.log(" Multi-Agent Coordinator Started");

  // 獲取用戶輸入，來源：使用者輸入
  const userInput = process.argv.slice(2).join(" ");

  // 初始化所有 agent
  const requirement = new RequirementAgent();
  const architect = new ArchitectAgent();
  const coder = new CoderAgent();
  const tester = new TesterAgent();

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
