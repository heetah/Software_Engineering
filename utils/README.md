# Utils 工具目錄

本目錄包含系統優化後新增的工具類別和輔助函數。

## 📁 文件結構

```
utils/
├── errors.js           # 自定義錯誤類別
├── error-handler.js    # 錯誤處理工具和中間件
├── config.js           # 統一的配置管理
├── token-tracker.js    # Token 使用追蹤器
└── README.md           # 本文件
```

## 🔧 各文件說明

### errors.js
定義了系統中使用的自定義錯誤類別：

- **CoordinatorError** - Coordinator 流程錯誤
- **AgentError** - Agent 執行錯誤
- **APIError** - API 調用錯誤
- **ValidationError** - 數據驗證錯誤

每個錯誤類別都包含：
- 錯誤訊息
- 原始錯誤
- 上下文資訊
- 時間戳
- 詳細資訊獲取方法

### error-handler.js
提供統一的錯誤處理工具：

- **withErrorHandling()** - 錯誤處理中間件，自動包裝函數執行
- **handleAPIError()** - 專門處理 API 調用錯誤
- **ErrorLogger** - 結構化錯誤日誌記錄器

使用示例：
```javascript
import { withErrorHandling, errorLogger } from './utils/error-handler.js';

const result = await withErrorHandling(
  'MyFunction',
  async () => {
    // 你的代碼
    return await someAsyncOperation();
  },
  { context: 'additional info' }
);
```

### config.js
統一的配置管理類別：

- 從環境變數讀取配置
- 提供配置驗證
- 支援按 Agent 獲取配置
- 提供配置摘要

使用示例：
```javascript
import { config } from './utils/config.js';

// 獲取 Agent 配置
const agentConfig = config.getAgentConfig('requirement');

// 驗證配置
const validation = config.validate();
if (!validation.valid) {
  console.error('配置錯誤:', validation.errors);
}

// 獲取配置摘要
const summary = config.getSummary();
```

### token-tracker.js
Token 使用追蹤和監控：

- 實時追蹤 Token 使用情況
- 按 Agent 和日期統計
- 使用量限制和警告
- 歷史記錄

使用示例：
```javascript
import { tokenTracker } from './utils/token-tracker.js';

// 自動記錄（在 BaseAgent 中已集成）
tokenTracker.record('RequirementAgent', {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150
});

// 獲取統計
const stats = tokenTracker.getStats();
console.log('總使用:', stats.total);
console.log('剩餘:', stats.remaining);

// 獲取 Agent 平均使用
const avg = tokenTracker.getAgentAverage('RequirementAgent');
```

## 🔗 依賴關係

```
errors.js (基礎)
  ↑
  ├── error-handler.js (使用)
  └── agent-base.js (使用)

config.js (獨立)
  ↑
  ├── agent-base.js (使用)
  └── token-tracker.js (使用)

token-tracker.js
  ↑
  └── agent-base.js (使用)
```

## 📝 注意事項

1. **環境變數**: 大部分配置通過環境變數設置，請參考 `.env` 文件
2. **錯誤處理**: 建議使用 `withErrorHandling()` 包裝所有異步操作
3. **Token 追蹤**: 已在 `BaseAgent` 中自動集成，無需手動調用
4. **配置驗證**: 系統啟動時會自動驗證配置，如有問題會顯示警告

## 🚀 擴展建議

如需添加新的工具類別：

1. 在 `utils/` 目錄下創建新文件
2. 遵循現有的代碼風格和結構
3. 更新本 README 文件
4. 在相關文件中導入和使用

