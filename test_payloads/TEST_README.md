# Test Payloads - 測試工具

這個目錄包含了通用的測試腳本，可以輕鬆將任意 payload 傳送給 Vision Agent 進行測試。

## ⚡ 快速開始

```powershell
# 互動式測試選單（推薦）
.\quick_test.ps1

# 或直接執行測試
.\test_payload.ps1 example1_static_website.json
```

## 📁 檔案結構

```
test_payloads/
├── quick_test.ps1                # 🚀 互動式測試選單（推薦）
├── send_to_vision_agent.js       # 單一 payload 測試腳本 (Node.js)
├── test_payload.ps1              # 單一 payload 測試腳本 (PowerShell)
├── batch_test.js                 # 批次測試腳本
├── test_setup_generation.js      # Setup 檔案生成測試
├── TEST_README.md                # 📖 本文件
├── standard_payload_spec.json    # Payload 規格文件
├── example1_static_website.json  # 範例 1: 靜態網站
├── example2_task_manager.json    # 範例 2: Task Manager (含 API)
├── example3_chat_app.json        # 範例 3: Chat App (含 WebSocket)
├── valid_payload.json            # 有效的測試 payload
├── bad_path_payload.json         # 無效路徑測試
└── oversized_payload.json        # 超大檔案測試
```

## 🚀 使用方法

### 1. 單一 Payload 測試

將指定的 payload 發送到 Vision Agent：

**Node.js 版本（跨平台）：**
```bash
# 基本用法
node send_to_vision_agent.js <payload_file.json>

# 範例
node send_to_vision_agent.js example1_static_website.json
node send_to_vision_agent.js example2_task_manager.json
node send_to_vision_agent.js example3_chat_app.json
```

**PowerShell 版本（Windows）：**
```powershell
# 基本用法
.\test_payload.ps1 <payload_file.json>

# 範例
.\test_payload.ps1 example1_static_website.json
.\test_payload.ps1 example2_task_manager.json
.\test_payload.ps1 example3_chat_app.json
```

**功能：**
- ✅ 自動讀取並驗證 payload JSON
- ✅ 顯示 payload 資訊（檔案數、contracts、setup）
- ✅ 發送到 Vision Agent API
- ✅ 顯示回應結果（生成的檔案、metadata、notes）
- ✅ 自動儲存回應到 `../responses/` 目錄
- ✅ 提供下一步操作建議

**輸出範例：**
```
📦 Loading payload: example2_task_manager.json
✅ Payload loaded successfully
   Files: 4
   Has contracts: true
   Has setup: true

🚀 Sending to Vision Agent: http://localhost:3000/api/vision/analyze

✅ Vision Agent response received (3.45s)
   Request ID: coder-1699456789
   Files generated: 9

📄 Generated files:
   1. index.html (html)
   2. styles.css (css)
   3. app.js (javascript)
   4. api.py (python)
   5. requirements.txt (text)
   6. .env.example (text)
   7. README.md (markdown)
   8. start.sh (shell)
   9. start.bat (batch)

💾 Response saved to: ../responses/example2_task_manager-response-2025-11-08.json
```

### 2. 批次測試

自動測試多個 payload 並生成報告：

```bash
# 測試所有 example*.json 檔案
node batch_test.js

# 測試指定的檔案
node batch_test.js example1 example2
node batch_test.js example1_static_website.json example3_chat_app.json
```

**功能：**
- ✅ 自動找出所有 `example*.json` 檔案
- ✅ 依序執行每個測試（間隔 2 秒）
- ✅ 顯示每個測試的結果
- ✅ 生成測試總結報告
- ✅ 儲存完整報告到 JSON 檔案

**輸出範例：**
```
🧪 BATCH TEST RUNNER
   Testing 3 payload(s)

============================================================
Testing: example1_static_website.json
============================================================
[... test output ...]

============================================================
Testing: example2_task_manager.json
============================================================
[... test output ...]

============================================================
📊 TEST SUMMARY
============================================================

Total tests: 3
✅ Passed: 3
❌ Failed: 0
Success rate: 100.0%

✅ Successful tests:
   example1_static_website.json (2.34s)
   example2_task_manager.json (3.45s)
   example3_chat_app.json (4.12s)

💾 Report saved to: batch_test_report_1699456789.json
```

### 3. Setup 檔案生成測試

測試 Coordinator 的 setup 檔案自動生成功能：

```bash
node test_setup_generation.js
```

**功能：**
- ✅ 使用 Mock API 測試（不需要實際的 Gemini API）
- ✅ 驗證 setup 檔案生成邏輯
- ✅ 顯示生成的 setup 檔案內容
- ✅ 檢查 requirements.txt、.env.example、README.md 等

## 📋 環境需求

### Vision Agent 必須先啟動

在執行測試前，確保 Vision Agent 正在運行：

```bash
cd ../vision-agent
node server.js
```

Vision Agent 預設監聽 `http://localhost:3000`。

如果使用不同的 URL，可以設定環境變數：

```bash
# Windows PowerShell
$env:VISION_AGENT_URL="http://localhost:8080"
node send_to_vision_agent.js example1_static_website.json

# Linux/Mac
VISION_AGENT_URL=http://localhost:8080 node send_to_vision_agent.js example1_static_website.json
```

### 安裝依賴

```bash
npm install axios
```

## 📝 建立自己的 Payload

參考 `standard_payload_spec.json` 建立符合規格的 payload：

```json
{
  "output": {
    "coder_instructions": {
      "task": "你的專案描述",
      "requirements": "功能需求",
      "files": [
        {
          "path": "index.html",
          "type": "html",
          "description": "檔案描述",
          "dependencies": []
        }
      ],
      "contracts": {
        "api": [...],      // 可選
        "modules": [...],  // 可選
        "events": [...],   // 可選
        "storage": [...],  // 可選
        "classes": [...]   // 可選
      },
      "setup": {           // 可選
        "runtime": "python",
        "pythonVersion": "3.8+",
        "dependencies": {
          "python": ["flask==3.0.0"]
        },
        "environmentVariables": {
          "PORT": "5000"
        },
        "startCommands": {
          "backend": "python app.py"
        },
        "instructions": "安裝與啟動說明"
      }
    }
  }
}
```

然後測試：

```bash
node send_to_vision_agent.js my_custom_payload.json
```

## 🔍 查看結果

### 1. 在 Vision Agent Dashboard

開啟瀏覽器：`http://localhost:3000/dashboard`

可以看到所有生成的專案列表。

### 2. 檢查回應檔案

所有 API 回應都會儲存在 `../responses/` 目錄：

```bash
cat ../responses/example2_task_manager-response-2025-11-08.json
```

### 3. 查看生成的檔案

生成的檔案位於 `../coder-agent/outputs/<request_id>/`：

```bash
ls ../coder-agent/outputs/coder-1699456789/
```

## ⚙️ 進階選項

### 自訂超時時間

修改 `send_to_vision_agent.js` 中的 `timeout` 設定（預設 5 分鐘）：

```javascript
const response = await axios.post(VISION_API_ENDPOINT, payload, {
  timeout: 600000, // 10 分鐘
});
```

### 停用顏色輸出

如果終端不支援顏色，可以修改 `colors` 物件：

```javascript
const colors = {
  reset: '', bright: '', green: '', red: '', 
  yellow: '', blue: '', cyan: '',
};
```

## 🐛 常見問題

### 錯誤: `Cannot connect to Vision Agent`

**解決方法：**
1. 確認 Vision Agent 正在運行：`cd ../vision-agent && node server.js`
2. 檢查 PORT 是否正確（預設 3000）
3. 檢查防火牆設定

### 錯誤: `Invalid JSON`

**解決方法：**
1. 使用 JSON validator 檢查 payload 格式
2. 確認所有引號、逗號、括號都正確
3. 參考 `standard_payload_spec.json` 範例

### 錯誤: `timeout of 300000ms exceeded`

**解決方法：**
1. 檔案數量太多，增加 timeout 時間
2. 檢查 Gemini API 配額是否用完
3. 使用 Mock API 測試：修改 `coordinator.js` 的 `USE_MOCK_API = true`

## 📚 相關文件

- [Payload Specification](./standard_payload_spec.json) - 完整的 payload 規格文件
- [Coordinator Documentation](../coder-agent/README.md) - Coordinator 使用說明
- [Vision Agent API](../vision-agent/README.md) - Vision Agent API 文件

## 🤝 貢獻

如果你有新的測試 payload 或改進建議，歡迎新增到這個目錄！

建議的命名規則：
- `example<N>_<project_type>.json` - 範例 payload
- `test_<feature>.json` - 功能測試 payload
- `edge_case_<scenario>.json` - 邊界條件測試
