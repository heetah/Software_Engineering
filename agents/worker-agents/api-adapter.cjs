/**
 * Cloud API Adapter
 * 支援多種 LLM API (OpenAI, Google Gemini 等)
 */

async function callCloudAPI({ endpoint, apiKey, systemPrompt, userPrompt, maxTokens = 8192, modelTier = 'strong' }) {
  // 使用 Node.js 18+ 內建 fetch 或 node-fetch
  let fetch;
  try {
    fetch = global.fetch || require('node-fetch');
  } catch {
    fetch = global.fetch;
  }

  // 偵測 API 類型
  const isGemini = endpoint.includes('goog') || endpoint.includes('gemini') || endpoint.includes('generativelanguage');

  let requestBody, headers, apiUrl;

  if (isGemini) {
    // Google Gemini API 格式
    // 確保 endpoint 指向具體的 generateContent 方法
    let baseUrl = endpoint;
    if (baseUrl.endsWith('/v1beta') || baseUrl.endsWith('/v1')) {
      // 如果只是 base URL，加上預設模型路徑
      // 默認使用 gemini-2.5-flash (或根據 modelTier 調整)
      baseUrl = `${baseUrl}/models/gemini-2.5-flash:generateContent`;
    } else if (baseUrl.includes('/models/') && !baseUrl.includes(':generateContent')) {
      // 如果有模型但沒方法，加上方法
      baseUrl = `${baseUrl}:generateContent`;
    }

    // 自適應模型選擇 (Adaptive Model Selection)
    if (modelTier === 'fast') {
      // 如果已經指定了模型，替換成 flash
      if (baseUrl.includes('/models/')) {
        baseUrl = baseUrl.replace(/\/models\/[^:]+:/, '/models/gemini-2.5-flash:');
      }
      console.log(`[API Adapter] ⚡ Using FAST model (Gemini Flash)`);
    } else {
      // Strong tier
      console.log(`[API Adapter] Using Gemini model`);
    }

    apiUrl = `${baseUrl}?key=${apiKey}`;

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
    // OpenAI API 格式
    // 確保 endpoint 指向 chat/completions
    let baseUrl = endpoint;
    if (!baseUrl.endsWith('/chat/completions')) {
      baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
      baseUrl = `${baseUrl}/chat/completions`;
    }

    apiUrl = baseUrl;

    // 自適應模型選 (Adaptive Model Selection)
    let modelName = 'gpt-4o'; // Default strong
    if (modelTier === 'fast') {
      modelName = 'gpt-4o-mini';
      console.log(`[API Adapter] ⚡ Using FAST model (GPT-4o-mini)`);
    } else {
      console.log(`[API Adapter] Using STRONG model (${modelName})`);
    }

    headers = {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    requestBody = {
      model: modelName,
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
