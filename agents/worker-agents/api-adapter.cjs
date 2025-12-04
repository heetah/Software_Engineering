/**
 * Cloud API Adapter
 * 支援多種 LLM API (OpenAI, Google Gemini 等)
 */

async function callCloudAPI({ endpoint, apiKey, systemPrompt, userPrompt, maxTokens = 8192 }) {
  // 使用 Node.js 18+ 內建 fetch 或 node-fetch
  let fetch;
  try {
    fetch = global.fetch || require('node-fetch');
  } catch {
    fetch = global.fetch;
  }
  
  // 偵測 API 類型
  const isGemini = endpoint.includes('generativelanguage.googleapis.com');
  
  let requestBody, headers, apiUrl;
  
  if (isGemini) {
    // Google Gemini API 格式
    apiUrl = `${endpoint}?key=${apiKey}`;
    headers = { 'Content-Type': 'application/json' };
    requestBody = {
      contents: [{
        parts: [{
          text: `${systemPrompt}\n\n${userPrompt}`
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: maxTokens
      }
    };
  } else {
    // OpenAI API 格式 (GPT-4, Azure OpenAI 等)
    apiUrl = endpoint;
    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    requestBody = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: maxTokens,
      temperature: 0.7
    };
  }
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  
  // 解析回應
  let content, tokensUsed;
  
  if (isGemini) {
    const candidate = data.candidates?.[0];
    content = candidate?.content?.parts?.[0]?.text || '';
    tokensUsed = data.usageMetadata?.totalTokenCount || 0;
    
    // 檢查 Gemini 是否因安全原因阻止了內容
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
      console.warn(`[API Adapter] Gemini finishReason: ${finishReason}`);
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        throw new Error(`Content blocked by Gemini: ${finishReason}. Safety ratings: ${JSON.stringify(candidate?.safetyRatings || [])}`);
      }
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[API Adapter] Response truncated due to MAX_TOKENS');
      }
    }
    
    if (!content && tokensUsed > 0) {
      console.warn('[API Adapter] Gemini returned no content despite consuming tokens:', {
        finishReason,
        tokensUsed,
        safetyRatings: candidate?.safetyRatings
      });
    }
  } else {
    content = data.choices?.[0]?.message?.content || '';
    tokensUsed = data.usage?.total_tokens || 0;
  }
  
  return { content, tokensUsed };
}

module.exports = { callCloudAPI };
