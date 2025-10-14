# 專案名稱

這是一個使用 Electron、ESLint、Prettier 和 Git 建置的桌面應用程式專案。

## 已安裝的工具

### Electron

用於建置跨平台桌面應用程式。

### ESLint

程式碼品質檢查和錯誤檢測工具，支援多種語言：

- JavaScript
- HTML
- CSS
- JSON
- Node.js

### Prettier

程式碼自動格式化工具，確保程式碼風格一致性，支援多種語言：

- JavaScript
- HTML
- CSS
- JSON
- Node.js

### Git

分散式版本控制系統。

### Node.js

JavaScript 執行環境（已預先安裝）。

## 專案結構

```
PROJECT/
├── main.js          # Electron 主進程文件
├── index.html       # 主頁面
├── package.json     # 專案配置和依賴項
├── .eslintrc.js     # ESLint 配置
├── .prettierrc      # Prettier 配置
├── .prettierignore  # Prettier 忽略文件
├── .gitignore       # Git 忽略文件
└── README.md        # 專案說明文件
```

## 使用方法

### 開發環境

1. **安裝依賴項**（如果還沒安裝）：

   ```bash
   npm install
   ```

2. **啟動應用程式**：

   ```bash
   npm start
   ```

3. **開發模式**：
   ```bash
   npm run dev
   ```

### 程式碼品質

1. **檢查所有語言的程式碼品質**：

   ```bash
   npm run lint
   ```

2. **自動修復程式碼問題**：

   ```bash
   npm run lint:fix
   ```

3. **檢查特定語言**：

   ```bash
   npm run lint:js     # JavaScript
   npm run lint:html   # HTML
   npm run lint:css    # CSS
   npm run lint:json   # JSON
   ```

4. **格式化程式碼**：

   ```bash
   npm run format        # 所有語言
   npm run format:js     # JavaScript
   npm run format:html   # HTML
   npm run format:css    # CSS
   npm run format:json   # JSON
   ```

5. **檢查程式碼格式**：

   ```bash
   npm run format:check
   ```

6. **檢查程式碼格式**：

   ```bash
   npm run lint:js     # JavaScript
   npm run lint:html   # HTML
   npm run lint:css    # CSS
   npm run lint:json   # JSON
   ```

7. **格式化程式碼**：

   ```bash
   npm run format        # 所有語言
   npm run format:js     # JavaScript
   npm run format:html   # HTML
   npm run format:css    # CSS
   npm run format:json   # JSON
   ```

8. **檢查程式碼格式**：

   ```bash
   npm run format:check:check
   ```

### 版本控制

1. **檢查狀態**：

   ```bash
   git status
   ```

2. **新增文件**：

   ```bash
   git add .
   ```

3. **提交變更**：

   ```bash
   git commit -m "提交訊息"
   ```

4. **推送至遠端倉庫**：
   ```bash
   git push origin main
   ```

## 開發規範

- 使用 ESLint 檢查程式碼品質
- 使用 Prettier 格式化程式碼
- 遵循統一的程式碼風格
- 定期提交程式碼變更
