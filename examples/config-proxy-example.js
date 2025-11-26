/**
 * 方案 3：代理模式（Proxy）
 * 開發時使用代理，生產環境用相對路徑
 */

// --- 前端代碼（始終使用相對路徑）---
const API_BASE_URL = '/api';

fetch(`${API_BASE_URL}/expenses`)  // 實際請求 /api/expenses
  .then(res => res.json());

// --- 開發環境：配置代理（不需改代碼）---

// Vite (vite.config.js)
export default {
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
};

// Webpack (webpack.config.js)
module.exports = {
  devServer: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true
      }
    }
  }
};

// --- 執行流程 ---
/*
開發環境：
1. 瀏覽器請求：http://localhost:3000/api/expenses
2. Vite 代理轉發：http://localhost:5000/api/expenses
3. 前端代碼不需要知道後端端口

生產環境：
1. 前端打包後由後端提供
2. 瀏覽器請求：https://yourapp.com/api/expenses
3. 直接到後端，不需要代理
*/
