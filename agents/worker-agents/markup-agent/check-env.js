// 測試環境變數載入
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

console.log('====================================');
console.log('Environment Variables Check:');
console.log('====================================');
console.log('CLOUD_API_ENDPOINT:', process.env.CLOUD_API_ENDPOINT);
console.log('CLOUD_API_KEY:', process.env.CLOUD_API_KEY ? process.env.CLOUD_API_KEY.substring(0, 20) + '...' : 'NOT SET');
console.log('====================================');
console.log('');
console.log('Generator will use:', process.env.CLOUD_API_ENDPOINT ? 'CLOUD API' : 'MOCK');
