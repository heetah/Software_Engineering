# API Key 設定說明

## 問題診斷

你的 API Key 已經過期。錯誤訊息：

```
API key expired. Please renew the API key.
```

## 解決方案

### 1. 取得新的 Google API Key

前往 [Google Cloud Console](https://console.cloud.google.com/):

1. **建立或選擇專案**

   - 前往 https://console.cloud.google.com/
   - 選擇現有專案或建立新專案

2. **啟用所需的 API**

   - 前往「API 和服務」>「程式庫」
   - 搜尋並啟用以下 API：
     - ✅ **Cloud Vision API**
     - ✅ **Generative Language API** (Gemini)
     - ✅ **Vertex AI API**（可選）

3. **設定帳單**

   - 前往「帳單」
   - 連結或建立帳單帳戶
   - 注意：這些 API 有免費額度，但需要啟用帳單才能使用

4. **建立 API Key**

   - 前往「API 和服務」>「憑證」
   - 點擊「建立憑證」>「API 金鑰」
   - 複製生成的 API Key

5. **（建議）限制 API Key 權限**
   - 點擊剛建立的 API Key 進行編輯
   - 在「API 限制」中選擇「限制金鑰」
   - 只選擇需要的 API：
     - Cloud Vision API
     - Generative Language API
   - 儲存變更

### 2. 在專案中設定 API Key

有兩種方式：

#### 方式 A：使用環境變數（推薦）

1. 在專案根目錄建立 `.env` 檔案：

```
GOOGLE_API_KEY=你的新API金鑰
GEMINI_API_KEY=你的新API金鑰
```

2. 安裝 dotenv 套件：

```bash
npm install dotenv
```

3. 在 `main.js` 和 `services/gemini.js` 最上方加入：

```javascript
require("dotenv").config();
```

#### 方式 B：直接修改程式碼（測試用）

在以下檔案中替換 API Key：

1. **main.js** (第 14-15 行)：

```javascript
const GOOGLE_API_KEY = "你的新API金鑰";
```

2. **services/gemini.js** (第 4-5 行)：

```javascript
const GEMINI_API_KEY = "你的新API金鑰";
```

### 3. 測試 API 連線

執行測試腳本：

```bash
node test-api.js
```

如果看到 ✅，表示 API 設定成功！

## API 免費額度

- **Vision API**: 每月 1,000 次免費請求
- **Gemini API**: 每分鐘 60 次免費請求（有每日限制）

## 常見問題

### Q: 仍然無法連線？

檢查：

- API Key 是否正確複製（沒有多餘空格）
- 是否已在 Google Cloud Console 啟用對應的 API
- 是否已設定帳單帳戶
- API Key 的限制設定是否正確

### Q: 如何保護 API Key？

- ✅ 使用 `.env` 檔案
- ✅ 將 `.env` 加入 `.gitignore`
- ✅ 在 Google Cloud Console 設定 API Key 限制
- ❌ 不要將 API Key 直接寫在程式碼中並上傳到 Git

### Q: 如何監控 API 使用量？

前往 Google Cloud Console >「API 和服務」>「資訊主頁」查看使用統計。
