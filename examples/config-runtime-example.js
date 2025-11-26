/**
 * 方案 2：運行時配置檔（適合純 HTML/JS 項目）
 * 不需要構建工具，部署時修改 config.js 即可
 */

// --- config.js (部署時可修改) ---
window.APP_CONFIG = {
  // 開發環境：改成 'http://localhost:5000/api'
  // 生產環境：改成 '/api' 或 'https://api.yourapp.com'
  API_BASE_URL: '/api',
  ENVIRONMENT: 'production'
};

// --- app.js (業務邏輯，不需修改) ---
const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

fetch(`${API_BASE_URL}/expenses`)
  .then(res => res.json())
  .then(data => console.log(data));

// --- index.html ---
/*
<!DOCTYPE html>
<html>
<head>
  <script src="config.js"></script>  <!-- 先載入配置 -->
  <script src="app.js"></script>     <!-- 再載入業務邏輯 -->
</head>
<body>
  ...
</body>
</html>
*/

// 部署時只需要修改 config.js 一個文件！
