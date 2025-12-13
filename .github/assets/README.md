# 如何添加預覽圖片和 GIF

## 📸 準備圖片素材

### 需要的檔案

請將以下檔案放入這個資料夾：

1. **demo.gif** - 應用程式完整演示動畫
   - 建議尺寸：800-1200px 寬度
   - 建議時長：10-20 秒
   - 檔案大小：< 10MB

2. **chat-interface.png** - 聊天介面截圖
   - 展示用戶輸入需求和 AI 回應

3. **project-library.png** - 專案庫截圖
   - 展示專案卡片佈局

4. **code-generation.png** - 程式碼生成過程截圖
   - 展示 Agent 執行日誌

5. **settings.png** - 設定頁面截圖
   - 展示 API 設定選項

## 🎬 如何錄製 GIF

### Windows 推薦工具：ScreenToGif

1. **下載並安裝**
   - 訪問：https://www.screentogif.com/
   - 下載免費版本

2. **錄製步驟**
   ```
   1. 啟動應用程式 (npm start)
   2. 打開 ScreenToGif，選擇「Recorder」
   3. 調整錄製區域框住應用程式視窗
   4. 點擊「Record」開始錄製
   5. 展示主要功能：
      - 輸入需求
      - 查看生成過程
      - 下載專案
      - 瀏覽專案庫
   6. 按「Stop」停止錄製
   7. 在編輯器中刪除多餘幀
   8. File → Save as → 選擇 GIF 格式
   9. 儲存為 demo.gif 到此資料夾
   ```

3. **優化設定**
   - Frame rate: 10-15 fps
   - Size: 最大寬度 1000px
   - Quality: Medium-High
   - Loop: Yes

### 替代方案

**LICEcap** (輕量簡單)
- https://www.cockos.com/licecap/
- 直接錄製成 GIF

**ShareX** (功能豐富)
- https://getsharex.com/
- 支援螢幕錄影後轉 GIF

**線上轉換**
- 使用 Windows 內建「Xbox Game Bar」錄影
- 上傳到 https://ezgif.com/video-to-gif 轉換

## 📷 如何截圖

### Windows 內建工具

1. **使用 Snipping Tool**
   ```
   Win + Shift + S → 選擇區域 → 自動複製到剪貼簿
   在小畫家貼上 → 儲存為 PNG
   ```

2. **完整視窗截圖**
   ```
   Alt + PrtScn → 截取當前視窗
   ```

3. **自訂區域截圖**
   ```
   Win + Shift + S → 矩形選擇工具
   ```

### 建議截圖內容

**chat-interface.png**
- 顯示一個完整的對話範例
- 包含用戶輸入和 AI 回應
- 展示 Neumorphism UI 設計

**project-library.png**
- 顯示多個專案卡片
- 展示日期、預覽、開啟按鈕

**code-generation.png**
- 展示 Agent 日誌區塊
- 顯示各個 Agent 的執行狀態

**settings.png**
- 展示 API 設定選項
- 顯示模型選擇下拉選單

## ✅ 檢查清單

將圖片添加到此資料夾後：

- [ ] demo.gif (< 10MB)
- [ ] chat-interface.png
- [ ] project-library.png
- [ ] code-generation.png
- [ ] settings.png

## 💡 提示

- GIF 太大？使用 https://ezgif.com/optimize 壓縮
- 截圖模糊？確保使用 PNG 格式
- 需要編輯？使用 https://www.photopea.com/ (線上 Photoshop)

## 🚀 完成後

圖片添加完成後，README.md 會自動顯示這些預覽圖片！
