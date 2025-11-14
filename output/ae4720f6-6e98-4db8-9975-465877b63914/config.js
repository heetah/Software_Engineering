/**
 * 運行時配置文件
 * 部署時修改此文件以切換環境
 */
window.APP_CONFIG = {
  // 生產環境（預設）：使用相對路徑
  API_BASE_URL: '/api',
  
  // 開發環境（前後端分離時）：取消註解下面這行
  // API_BASE_URL: 'http://localhost:5000/api',
  
  ENVIRONMENT: 'production'
};