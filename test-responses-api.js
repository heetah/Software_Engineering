// 測試 Responses API 訪問
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;
const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

async function testResponsesAPI() {
    console.log('Testing Responses API...');
    console.log('Base URL:', baseUrl);
    console.log('API Key:', apiKey ? `${apiKey.substring(0, 10)}...` : 'NOT SET');

    const url = `${baseUrl}/responses`;

    // Responses API 使用 input (字符串)，不是 inputs (數組)
    const combinedPrompt = 'You are a helpful assistant.\n\nUser Request:\nSay "test successful"';

    const requestBody = {
        model: 'gpt-5.1-codex-max',
        input: combinedPrompt,
        temperature: 1
        // 注意：Responses API 不支持 max_tokens
    };

    console.log('\nRequest URL:', url);
    console.log('Request body:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        console.log('\nResponse status:', response.status);

        const data = await response.json();
        console.log('Response body:', JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error('\n❌ API call failed');
            if (response.status === 401) {
                console.error('  → Authentication failed');
            } else if (response.status === 404) {
                console.error('  → Endpoint not found');
            } else if (response.status === 400) {
                console.error('  → Bad request:', data.error?.message);
            }
        } else {
            console.log('\n✅ API call succeeded!');
            console.log('Model output:', data.output_text || data.text || data);
        }
    } catch (error) {
        console.error('\n❌ Network Error:', error.message);
    }
}

testResponsesAPI();
