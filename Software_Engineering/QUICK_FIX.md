# 快速修復指南

## 🔍 問題診斷結果

你的 API Key **已經過期**，這就是為什麼無法連線到 API 的原因。

錯誤訊息：

```
API key expired. Please renew the API key.
```

## ✅ 已完成的修復

1. ✅ 安裝 `node-fetch` 和 `dotenv` 套件
2. ✅ 更新程式碼以支援從 `.env` 讀取 API Key
3. ✅ 建立 `.env.example` 範本
4. ✅ 建立 API 測試腳本 (`test-api.js`)
5. ✅ 更新 README.md 和建立 API_SETUP.md 說明文件
6. ✅ 建立 `.gitignore` 保護 API Key

## 🚀 立即行動步驟

### 步驟 1：取得新的 API Key

前往 [Google Cloud Console](https://console.cloud.google.com/)：

1. **建立/選擇專案** → 選擇或建立一個專案
2. **啟用 API** → 前往「API 和服務」→「程式庫」，啟用：
   - ✅ Cloud Vision API
   - ✅ Generative Language API
   - ✅ Vertex AI API（可選）
3. **設定帳單** → 連結帳單帳戶（有免費額度）
4. **建立 API Key** → 前往「憑證」→「建立憑證」→「API 金鑰」
5. **複製 API Key** → 保存好這個金鑰

### 步驟 2：設定環境變數

在專案根目錄建立 `.env` 檔案：

```bash
# 複製範例檔案
copy .env.example .env
```

編輯 `.env` 檔案，填入你的 API Key：

```
GOOGLE_API_KEY=你剛複製的API金鑰
GEMINI_API_KEY=你剛複製的API金鑰
```

### 步驟 3：測試連線

```bash
node test-api.js
```

**預期結果：**

```
=== Google API 測試 ===
測試 Vision API...
✅ Vision API 運作正常

測試 Gemini API...
✅ Gemini API 運作正常

=== 測試結果 ===
Vision API: ✅ 正常
Gemini API: ✅ 正常
```

### 步驟 4：啟動應用程式

```bash
npm start
```

按 `Ctrl+Shift+A` 開始截圖，測試 AI 分析功能！

## 📚 詳細文件

- **API_SETUP.md** - 完整的 API 設定說明
- **README.md** - 應用程式使用說明
- **test-api.js** - API 連線測試腳本

## 💡 API 免費額度

- **Vision API**: 每月 1,000 次免費
- **Gemini API**: 每分鐘 60 次免費

## ❓ 常見問題

### Q: 仍然無法連線？

檢查：

- ✅ API Key 是否正確複製（沒有空格）
- ✅ 是否已啟用對應的 API
- ✅ 是否已設定帳單帳戶
- ✅ `.env` 檔案是否在正確位置

### Q: 如何保護我的 API Key？

- ✅ 使用 `.env` 檔案
- ✅ `.env` 已被加入 `.gitignore`
- ✅ 不要分享或上傳 `.env` 到 Git
- ✅ 在 Google Cloud Console 設定 API 限制

### Q: 如何監控使用量？

前往 Google Cloud Console → 「API 和服務」→「資訊主頁」

## 🎉 完成後

你就可以使用以下功能了：

- 📸 任意形狀截圖
- 📝 文字識別（OCR）
- 🏷️ 物件標籤識別
- 🤖 AI 智慧分析
- 💬 自然語言建議

祝使用愉快！
