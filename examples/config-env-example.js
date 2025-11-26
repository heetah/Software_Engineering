/**
 * 環境變量配置範例
 * 適用於：React, Vue, Vite, Webpack 等現代前端框架
 * 
 * 注意：這些是不同框架的範例，實際使用時只選擇一個
 */

// --- 方案 1A：使用構建工具的環境變量 ---

// React (Create React App) - 範例 1
// const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '/api';

// Vue (Vue CLI) - 範例 2
// const API_BASE_URL = process.env.VUE_APP_API_BASE_URL || '/api';

// Vite - 範例 3
// const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Next.js - 範例 4
// const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || '/api';

// --- 配置文件 ---

// .env.development (開發環境)
/*
VITE_API_BASE_URL=http://localhost:5000/api
*/

// .env.production (生產環境)
/*
VITE_API_BASE_URL=/api
*/

// --- 使用範例 ---
/*
fetch(`${API_BASE_URL}/expenses`)
  .then(res => res.json());
*/
