import fs from "fs";
import path from "path";

export class ConversationStorage {
  constructor() {
    this.baseDir = "./conversations";
    this.currentSession = null;
  }

  /**
   * 創建新的對話session
   * @param {string} userInput - 用戶輸入
   * @returns {string} sessionId
   */
  createSession(userInput) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sessionId = `session_${timestamp}`;
    this.currentSession = {
      id: sessionId,
      userInput,
      timestamp: new Date().toISOString(),
      agents: []
    };
    
    // 創建conversations目錄
    fs.mkdirSync(this.baseDir, { recursive: true });
    
    return sessionId;
  }

  /**
   * 記錄agent的輸入與輸出
   * @param {string} agentRole - Agent角色
   * @param {string} input - Agent輸入
   * @param {string} output - Agent輸出
   * @param {object} metadata - 額外資訊（時間戳、模型等）
   */
  recordAgent(agentRole, input, output, metadata = {}) {
    if (!this.currentSession) {
      console.warn("⚠️ 沒有active的session，無法記錄agent對話");
      return;
    }

    this.currentSession.agents.push({
      role: agentRole,
      input,
      output,
      timestamp: new Date().toISOString(),
      ...metadata
    });
  }

  /**
   * 記錄錯誤
   * @param {string} agentRole - Agent角色
   * @param {string} input - Agent輸入
   * @param {Error} error - 錯誤物件
   */
  recordError(agentRole, input, error) {
    if (!this.currentSession) return;

    this.currentSession.agents.push({
      role: agentRole,
      input,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 儲存完整對話紀錄到JSON檔案
   */
  saveConversation() {
    if (!this.currentSession) return;

    const filePath = path.join(this.baseDir, `${this.currentSession.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(this.currentSession, null, 2), "utf8");
    
    console.log(`\n💾 對話紀錄已儲存至: ${filePath}`);
    return filePath;
  }

  /**
   * 取得目前session的對話內容（Markdown格式）
   */
  getConversationMarkdown() {
    if (!this.currentSession) return "";

    let md = `# 對話記錄: ${this.currentSession.id}\n\n`;
    md += `**使用者輸入**: ${this.currentSession.userInput}\n\n`;
    md += `**開始時間**: ${this.currentSession.timestamp}\n\n`;
    md += `---\n\n`;

    this.currentSession.agents.forEach((agent, idx) => {
      md += `## ${idx + 1}. ${agent.role}\n\n`;
      md += `**輸入**:\n\`\`\`\n${agent.input}\n\`\`\`\n\n`;
      
      if (agent.error) {
        md += `**錯誤**: ${agent.error}\n\n`;
      } else {
        md += `**輸出**:\n\`\`\`\n${agent.output}\n\`\`\`\n\n`;
      }
      
      md += `---\n\n`;
    });

    return md;
  }

  /**
   * 儲存對話紀錄為Markdown檔案
   */
  saveConversationMarkdown() {
    if (!this.currentSession) return;

    const markdown = this.getConversationMarkdown();
    const filePath = path.join(this.baseDir, `${this.currentSession.id}.md`);
    fs.writeFileSync(filePath, markdown, "utf8");
    
    console.log(`📝 對話紀錄Markdown已儲存至: ${filePath}`);
    return filePath;
  }

  /**
   * 列出所有歷史對話紀錄
   */
  listConversations() {
    if (!fs.existsSync(this.baseDir)) return [];

    const files = fs.readdirSync(this.baseDir)
      .filter(file => file.endsWith(".json"))
      .map(file => ({
        id: path.basename(file, ".json"),
        path: path.join(this.baseDir, file),
        mtime: fs.statSync(path.join(this.baseDir, file)).mtime
      }))
      .sort((a, b) => b.mtime - a.mtime);

    return files;
  }

  /**
   * 讀取特定對話紀錄
   */
  loadConversation(sessionId) {
    const filePath = path.join(this.baseDir, `${sessionId}.json`);
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`找不到對話紀錄: ${sessionId}`);
    }

    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  }
}

