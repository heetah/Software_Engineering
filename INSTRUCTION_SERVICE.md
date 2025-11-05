# InstructionService 使用說明

## 概述

`InstructionService` 提供了一個會話管理和結構化計劃生成的系統，用於管理多代理應用的開發流程。

## 功能特點

1. **會話管理**: 每個計劃都會創建一個唯一的會話 ID，可以追蹤和管理
2. **結構化輸出**: 生成包含 `coder_instructions`、`plan` 和 `markdown` 的結構化 JSON
3. **檔案操作**: 自動創建計劃中指定的檔案結構
4. **計劃優化**: 支援基於反饋優化計劃

## 使用方法

### 1. 透過 Coordinator.js 使用（推薦）

#### 傳統模式（預設）
```bash
node Coordinator.js "建立一個待辦事項應用"
```

```

### 2. 程式化使用

```javascript
import InstructionService from "./agents/instructionService.js";

const service = new InstructionService();

// 創建計劃
const plan = await service.createPlan({
  prompt: "建立一個待辦事項應用",
  context: {
    requirementOutput: "...",
    timestamp: new Date().toISOString()
  }
});

console.log("會話 ID:", plan.id);
console.log("工作區目錄:", plan.workspaceDir);
console.log("檔案操作:", plan.fileOps);

// 獲取會話
const session = service.getSession(plan.id);

// 優化計劃
const refined = await service.refine(plan.id, "請添加用戶認證功能");
```

## 輸出結構

### createPlan 返回的物件

```javascript
{
  id: "uuid",
  createdAt: "2024-01-01T00:00:00.000Z",
  prompt: "用戶輸入",
  context: {...},
  output: {
    coder_instructions: {
      role: "Coder Agent",
      summary: "...",
      directives: [...],
      files: [...],
      commands: [...],
      acceptance: [...],
      notes: [...]
    },
    plan: {
      title: "...",
      summary: "...",
      steps: [...]
    },
    markdown: "..."
  },
  fileOps: {
    created: [...],
    skipped: [...],
    errors: [...]
  },
  workspaceDir: "data/sessions/uuid"
}
```

## 檔案操作

`materializeFiles` 函數會自動：
- 創建所需的目錄結構
- 根據 `files` 陣列創建檔案
- 驗證路徑安全性（防止目錄遍歷攻擊）
- 跳過已存在的檔案
- 返回詳細的操作結果

## 會話存儲

會話資料存儲在 `data/sessions/` 目錄下：
- 會話 JSON: `data/sessions/{sessionId}.json`
- 工作區目錄: `data/sessions/{sessionId}/`

## 與傳統流程的差異

| 特性 | 傳統流程 | InstructionService 模式 |
|------|---------|----------------------|
| 會話管理 | ❌ | ✅ |
| 結構化輸出 | 部分 | 完整 JSON |
| 檔案自動創建 | ❌ | ✅ |
| 計劃優化 | ❌ | ✅ |
| 工作區隔離 | ❌ | ✅ |

## 注意事項

1. 確保 `data/` 目錄有寫入權限
2. 會話資料會持續保存，需要時可手動清理
3. `ArchitectAgent` 需要正確配置 API 金鑰和端點

