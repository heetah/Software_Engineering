# Worker Agents - 雲端 API 配置指南

## 概述

Worker Agents 現在**主要依賴雲端 API（如 OpenAI GPT-4）** 來生成代碼。Mock 模式僅作為 fallback 備用機制。

## 當前實作狀態

✅ **已實作：雲端 API 調用流程**
- Markup Agent (HTML)
- Style Agent (CSS)
- Script Agent (JavaScript)
- Python Agent (Python)

⚠️ **Mock 模式**：僅提供極簡 fallback 模板，不適用於生產環境

## 配置方式

### 方法 1：環境變數

```bash
# Windows PowerShell
$env:CLOUD_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
$env:CLOUD_API_KEY = "sk-your-api-key-here"

# Linux/Mac
export CLOUD_API_ENDPOINT="https://api.openai.com/v1/chat/completions"
export CLOUD_API_KEY="sk-your-api-key-here"
```

### 方法 2：啟動腳本

修改 `worker-agents/start-all-agents.ps1`：

```powershell
# 在啟動每個 agent 之前設置環境變數
$env:CLOUD_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
$env:CLOUD_API_KEY = "your-api-key"

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$markupAgentPath'; node server.js"
```

## API 端點格式

支持 OpenAI 兼容的 API：

- **OpenAI**: `https://api.openai.com/v1/chat/completions`
- **Azure OpenAI**: `https://your-resource.openai.azure.com/openai/deployments/your-deployment/chat/completions?api-version=2023-05-15`
- **其他兼容 API**: 任何支持 ChatGPT 格式的端點

## 工作流程

```
User Request
   ↓
Vision Agent (描述需求)
   ↓
Coder Agent (分析依賴)
   ↓
Coordinator (Phase 1: 生成骨架)
   ↓
Coordinator (Phase 2: 調用 Worker Agents)
   ↓
Worker Agent → 雲端 API (生成完整代碼)
   ↓
   ├─ 成功 → 返回生成的代碼
   └─ 失敗 → Fallback 到 Mock 模板（⚠️ 僅基本結構）
```

## 成本估算

每個檔案生成大約使用：
- Input tokens: 500-1000 (prompt)
- Output tokens: 1000-3000 (generated code)
- 總計: ~1500-4000 tokens per file

以 GPT-4 價格為例：
- Input: $0.03 / 1K tokens
- Output: $0.06 / 1K tokens
- 每個檔案成本: ~$0.15-0.30

計算機應用（3個檔案）：約 $0.50

## Fallback 行為

如果未配置 API 或 API 調用失敗：

```javascript
// Markup Agent fallback
<!DOCTYPE html>
<html>
<head>
    <title>Page</title>
</head>
<body>
    <h1>Content</h1>
    <p>⚠️ Fallback template - Cloud API required</p>
</body>
</html>

// Script Agent fallback
console.log('⚠️ Fallback code - Cloud API required');

// Style Agent fallback
body { 
    font-family: sans-serif; 
}
```

## 測試

### 使用 Mock 模式（無需 API）
```bash
# 不設置環境變數，直接運行
node send-calculator-payload.js
# 將生成基本 fallback 模板
```

### 使用雲端 API（生產模式）
```powershell
# 設置 API
$env:CLOUD_API_ENDPOINT = "https://api.openai.com/v1/chat/completions"
$env:CLOUD_API_KEY = "sk-..."

# 重啟所有 agents
cd worker-agents
.\start-all-agents.ps1

# 發送請求
cd ..
node send-calculator-payload.js
```

## 下一步

1. **配置 OpenAI API Key**
2. **測試完整流程**：發送 calculator payload
3. **驗證輸出質量**：檢查生成的 HTML/CSS/JS
4. **監控成本**：追蹤 token 使用量
5. **優化 prompt**：根據輸出調整 buildPrompt() 方法

## 注意事項

⚠️ **Mock 模式限制**：
- 只返回極簡模板
- 不理解需求細節
- 無法生成複雜邏輯
- 僅用於測試架構流程

✅ **雲端 API 優勢**：
- 理解自然語言需求
- 生成生產級代碼
- 支持任意複雜度
- 自動處理依賴關係
