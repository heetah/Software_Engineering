const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'worker-agents', '.env') });

console.log('--- DEBUG ENV ---');
console.log('CLOUD_API_ENDPOINT:', process.env.CLOUD_API_ENDPOINT);
console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL);
console.log('CLOUD_API_KEY:', process.env.GOOGLE_API_KEY ? '(present)' : '(missing)');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '(present)' : '(missing)');
console.log('--- END DEBUG ---');
