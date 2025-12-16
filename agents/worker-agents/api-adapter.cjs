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
      console.log(`[API Adapter]  Using FAST model (Gemini 2.5 Flash)`);
    } else {
      // Strong tier - Coder Agent worker 使用
      if (baseUrl.includes('/models/')) {
        baseUrl = baseUrl.replace(/\/models\/[^:]+:/, '/models/gemini-2.5-pro:');
      }
      console.log(`[API Adapter]  Using STRONG model (Gemini 3 Pro)`);
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
    // 確保 endpoint 指向正確的 API
    let baseUrl = endpoint;

    // 自適應模型選擇 (Adaptive Model Selection)
    let modelName = 'gpt-5.1-codex-max'; // Pro tier 使用自定義強模型
    if (modelTier === 'fast') {
      modelName = 'gpt-5-mini'; // Fast tier 使用標準模型
      console.log(`[API Adapter] Using FAST model (gpt-5-mini)`);
    } else {
      console.log(`[API Adapter] Using STRONG model (${modelName})`);
    }

    // 根據模型選擇不同的 endpoint 和請求格式
    const isProCodexModel = modelName === 'gpt-5.1-codex-max';

    if (isProCodexModel) {
      // Pro 模型: gpt-5.1-codex-max 使用 /responses endpoint + input 字符串格式
      if (!baseUrl.endsWith('/responses')) {
        baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        baseUrl = `${baseUrl}/responses`;
      }
      apiUrl = baseUrl;

      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      // Responses API 使用 input (字符串)，需要合併 prompts
      const combinedPrompt = `${systemPrompt}\n\nUser Request:\n${userPrompt}`;

      requestBody = {
        model: modelName,
        input: combinedPrompt,  // 使用 input (字符串)，不是 inputs (數組)
        temperature: 1
        // 注意：Responses API 不支持 max_tokens 參數
      };
    } else {
      // Fast 模型: gpt-5-mini 使用標準 /chat/completions endpoint + messages 格式
      if (!baseUrl.endsWith('/chat/completions')) {
        baseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        baseUrl = `${baseUrl}/chat/completions`;
      }
      apiUrl = baseUrl;

      headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };
      requestBody = {
        model: modelName,
        messages: [  // 標準 OpenAI API 使用 messages
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
      };
    }
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
    // OpenAI API 響應格式
    // Responses API 的 output 可能是數組
    if (data.output && Array.isArray(data.output) && data.output.length > 0) {
      // 過濾出 message 類型並提取內容
      const messageBlocks = data.output.filter(block =>
        typeof block === 'object' && block.type === 'message'
      );

      content = messageBlocks
        .map(block => {
          let blockContent = block.content;
          // content 可能是數組
          if (Array.isArray(blockContent)) {
            return blockContent
              .map(item => {
                if (typeof item === 'string') return item;
                if (typeof item === 'object') {
                  return item.text || item.content || '';
                }
                return '';
              })
              .join('');
          }
          // content 可能是對象
          if (typeof blockContent === 'object' && blockContent !== null) {
            return blockContent.text || blockContent.content || '';
          }
          // content 是字符串
          if (typeof blockContent === 'string') {
            return blockContent;
          }
          return '';
        })
        .join('');
      tokensUsed = data.usage?.total_tokens || 0;
    } else if (typeof data.output_text === 'string') {
      // Responses API string format
      content = data.output_text;
      tokensUsed = data.usage?.total_tokens || 0;
    } else if (typeof data.text === 'string') {
      content = data.text;
      tokensUsed = data.usage?.total_tokens || 0;
    } else if (data.choices?.[0]?.text !== undefined) {
      // Completions API 格式
      content = data.choices?.[0]?.text || '';
      tokensUsed = data.usage?.total_tokens || 0;
    } else {
      // Chat Completions API 格式
      content = data.choices?.[0]?.message?.content || '';
      tokensUsed = data.usage?.total_tokens || 0;
    }

    // 確保 content 是字符串
    if (typeof content !== 'string') {
      console.warn('[API Adapter] Content is not a string, converting...', { type: typeof content });
      content = String(content || '');
    }
  }

  return { content, tokensUsed };
}

module.exports = { callCloudAPI };
