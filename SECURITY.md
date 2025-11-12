# 🔐 API Key 安全防護指南

## ⚠️ 重要提醒

**絕對不要將以下文件 push 到 GitHub：**
- ❌ `.env` - 包含真實 API Key
- ❌ `node_modules/` - 第三方套件（太大且不必要）
- ❌ 任何包含 API Key 的配置文件

**可以安全 push 的文件：**
- ✅ `.env.example` - 範例模板（不含真實 Key）
- ✅ `.gitignore` - Git 忽略規則
- ✅ `package.json` - 套件清單
- ✅ 程式碼文件（確保沒有硬編碼 API Key）

---

## 📋 快速設置步驟

### 1️⃣ 複製環境變數範例文件
```powershell
Copy-Item .env.example .env
```

### 2️⃣ 編輯 .env 文件，填入你的真實 API Key
```powershell
notepad .env
```

**修改這一行：**
```env
CLOUD_API_KEY=your-google-cloud-api-key-here
```

**改成你的真實 Key：**
```env
CLOUD_API_KEY=AIzaSyD1234567890abcdefghijklmnopqrstuv
```

### 3️⃣ 確認 .gitignore 已正確配置
`.gitignore` 應包含：
```gitignore
# 環境變數文件（包含真實 API Key）
.env
.env.*
!.env.example

# Node.js 套件目錄
node_modules/

# 輸出目錄
outputs/
generated/
```

### 4️⃣ 檢查是否有文件會被誤推送
```powershell
# 查看將要提交的文件
git status

# 如果看到 .env 或 node_modules/，執行：
git rm --cached .env
git rm -r --cached node_modules/
```

---

## 🔍 檢查代碼中是否硬編碼了 API Key

### ✅ 正確做法（使用環境變數）
```javascript
// ✅ Good: 從環境變數讀取
const apiKey = process.env.CLOUD_API_KEY;
```

```python
# ✅ Good: 從環境變數讀取
import os
api_key = os.getenv('CLOUD_API_KEY')
```

### ❌ 錯誤做法（硬編碼）
```javascript
// ❌ Bad: 直接寫在代碼中
const apiKey = "AIzaSyD1234567890abcdefghijklmnopqrstuv";
```

---

## 🛡️ Git 提交前檢查清單

在每次 `git push` 之前，執行以下檢查：

```powershell
# 1. 檢查暫存區的文件
git status

# 2. 確認沒有敏感文件
git diff --cached

# 3. 搜索代碼中是否有 API Key
Select-String -Path .\*.js -Pattern "AIza" -Exclude ".env*"
Select-String -Path .\*.py -Pattern "AIza" -Exclude ".env*"

# 4. 確認 .gitignore 生效
git check-ignore .env
# 應該輸出: .env

git check-ignore node_modules/
# 應該輸出: node_modules/
```

---

## 🚨 如果不小心上傳了 API Key 怎麼辦？

### 1️⃣ 立即撤銷 API Key
前往 Google Cloud Console：
1. 打開 [API Credentials](https://console.cloud.google.com/apis/credentials)
2. 找到洩漏的 API Key
3. 點擊 **刪除** 或 **重新生成**

### 2️⃣ 從 Git 歷史中移除
```powershell
# 安裝 BFG Repo-Cleaner
# https://rtyley.github.io/bfg-repo-cleaner/

# 或使用 git filter-branch（較慢）
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch .env" \
  --prune-empty --tag-name-filter cat -- --all
```

### 3️⃣ 強制推送新歷史
```powershell
git push --force --all
```

---

## 📝 團隊協作注意事項

### 新成員加入時：
1. 給他們 `.env.example` 文件
2. 讓他們複製為 `.env` 並填入 API Key
3. 確認他們的 `.env` **不會** 被 Git 追蹤：
   ```powershell
   git status
   # 不應該看到 .env
   ```

### 添加新環境變數時：
1. 更新 `.env.example`（使用假值或說明）
2. 更新此 README 文件
3. 通知團隊成員更新他們的 `.env`

---

## 🔗 相關資源

- [Google Cloud API Key 管理](https://cloud.google.com/docs/authentication/api-keys)
- [Git 忽略文件最佳實踐](https://git-scm.com/docs/gitignore)
- [Environment Variables in Node.js](https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs)
- [dotenv 套件文檔](https://www.npmjs.com/package/dotenv)

---

## ✅ 當前安全狀態

- ✅ `.gitignore` 已配置
- ✅ `.env.example` 已創建
- ✅ 代碼使用 `process.env.CLOUD_API_KEY`
- ✅ `node_modules/` 不會被推送
- ✅ `outputs/` 目錄不會被推送

**下一步：確保所有團隊成員都閱讀此文件！**
