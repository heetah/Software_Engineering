# Screenshot Tool with Free-form Selection

一個功能強大的桌面截圖應用程式，使用 Electron 建構，具有任意形狀選取和 AI 圖片分析功能。

## 功能特色

- **任意形狀選取**: 使用套索工具建立自訂形狀的選取區域
- **高 DPI 支援**: 完整支援高 DPI 顯示器和適當的縮放
- **AI 圖片分析**: 整合 Google Vision API 和 Gemini API 進行智慧圖片分析
- **全域快捷鍵**: 使用 `Ctrl+Shift+A` (Windows) 或 `Cmd+Shift+A` (macOS) 快速啟動
- **現代化 UI**: 具有流暢動畫和視覺回饋的 Soft UI 設計

## 系統需求

- Node.js >= 16.0.0
- npm >= 8.0.0
- Google Cloud API Key（用於圖片分析功能）

## 安裝步驟

1. 複製此專案
2. 安裝相依套件：

```bash
npm install
```

3. 設定 API Key：

```bash
# 複製環境變數範例檔案
copy .env.example .env

# 編輯 .env 檔案，填入你的 API Key
# GOOGLE_API_KEY=你的API金鑰
# GEMINI_API_KEY=你的API金鑰
```

### 取得 Google API Key

詳細步驟請參考 [API_SETUP.md](API_SETUP.md)

簡要步驟：

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 建立或選擇專案
3. 啟用以下 API：
   - Cloud Vision API
   - Generative Language API
   - Vertex AI API（可選）
4. 建立 API 金鑰
5. 將金鑰複製到 `.env` 檔案

### 測試 API 連線

```bash
node test-api.js
```

如果看到 ✅，表示設定成功！

## 開發模式

啟動應用程式：

```bash
npm start
```

啟用除錯模式：

```bash
npm run dev
```

## 使用方式

1. 按下 `Ctrl+Shift+A` (Windows) 或 `Cmd+Shift+A` (macOS) 開始截圖
2. 使用滑鼠繪製任意形狀的選取區域
3. 放開滑鼠完成選取
4. 等待 AI 分析結果顯示
5. 按 `Esc` 可隨時取消截圖

## 專案結構

- `main.js`: Electron 主程序，處理視窗管理和 IPC 通訊
- `preload.js`: 預載腳本，用於安全的 IPC 通訊
- `renderer.js`: UI 邏輯和截圖功能實作
- `index.html`: 主應用程式視窗
- `style.css`: 應用程式樣式
- `services/gemini.js`: Gemini API 服務
- `temp/`: 截圖暫存目錄
- `.env`: 環境變數設定（包含 API Key）
- `API_SETUP.md`: API 設定詳細說明

## 功能詳解

### 套索選取工具

- 流暢的繪製與點插值
- 即時預覽與尺寸顯示
- 多層次視覺回饋
- 自動路徑閉合

### AI 圖片分析

- **文字識別**：辨識圖片中的文字內容
- **物件標籤**：識別圖片中的物件和場景
- **智慧分析**：使用 Gemini AI 提供深入分析和建議
- **多語言支援**：支援中英文等多種語言

### 截圖處理

- 自動管理暫存目錄
- Base64 圖片編碼/解碼
- 適當的媒體串流清理
- 完整的錯誤處理與恢復

## 技術細節

### 顯示處理

- 原生解析度偵測
- DPI 縮放補償
- 多螢幕支援
- 透明視窗管理

### 安全功能

- 啟用 Context Isolation
- 停用 Node Integration
- 安全的 IPC 通訊
- 沙盒化 Renderer 程序

## 錯誤處理

應用程式包含完整的錯誤處理：

- 視窗建立失敗
- 截圖擷取錯誤
- 檔案系統操作
- 全域快捷鍵註冊
- API 連線失敗

## API 免費額度

- **Vision API**: 每月 1,000 次免費請求
- **Gemini API**: 每分鐘 60 次免費請求

## 疑難排解

### API 無法連線？

請檢查：

1. `.env` 檔案中的 API Key 是否正確
2. 是否已在 Google Cloud Console 啟用對應的 API
3. 是否已設定帳單帳戶
4. 執行 `node test-api.js` 測試連線

詳細說明請參考 [API_SETUP.md](API_SETUP.md)

## 貢獻

1. Fork 此專案
2. 建立功能分支
3. 提交你的更改
4. 推送到分支
5. 建立 Pull Request

## 授權

[MIT License](LICENSE)

## 致謝

- Electron 團隊提供的優秀框架
- Google Cloud 提供的 AI API
- 社群貢獻者和測試人員
