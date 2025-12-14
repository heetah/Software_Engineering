/**
 * Gemini API 診斷工具
 * 用於檢查 Gemini API 配置和連接問題
 */

import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

/**
 * 診斷 Gemini API 配置
 */
export async function diagnoseGeminiAPI() {
  const results = {
    hasApiKey: false,
    hasBaseUrl: false,
    apiKeyValid: false,
    baseUrlValid: false,
    connectionTest: false,
    errors: [],
    warnings: [],
    info: []
  };

  // 檢查環境變數
  const apiKey = process.env.GOOGLE_API_KEY;
  const baseUrl = 'https://generativelanguage.googleapis.com/v1beta';
  // 嘗試多個可能的模型名稱
  const model = 'gemini-2.5-flash';

  results.hasApiKey = !!apiKey;
  results.hasBaseUrl = !!baseUrl;

  if (!apiKey) {
    results.errors.push('GOOGLE_API_KEY is not set in environment variables');
    return results;
  }

  if (apiKey.length < 20) {
    results.warnings.push('GOOGLE_API_KEY seems too short, may be invalid');
  }

  // 檢查 Base URL 格式
  if (!baseUrl.includes('generativelanguage.googleapis.com')) {
    results.warnings.push('GOOGLE_API_KEY does not contain generativelanguage.googleapis.com');
  }

  // 首先嘗試列出可用的模型
  let availableModels = [];
  try {
    const listModelsUrl = `${baseUrl}/models?key=${apiKey}`;
    results.info.push('Fetching available models...');

    const listResponse = await axios.get(listModelsUrl, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (listResponse.status === 200 && listResponse.data.models) {
      availableModels = listResponse.data.models
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => m.name.replace('models/', ''));

      results.info.push(`✅ Found ${availableModels.length} available model(s): ${availableModels.join(', ')}`);
    }
  } catch (error) {
    results.warnings.push('Could not fetch available models list');
    if (error.response?.data) {
      results.warnings.push(`Error: ${JSON.stringify(error.response.data)}`);
    }
  }

  // 測試 API 連接
  // 優先使用從 API 獲取的模型列表，否則嘗試常見的模型名稱
  const possibleModels = availableModels.length > 0
    ? availableModels
    : [
      model,
      'gemini-pro',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-pro-vision'
    ].filter((m, i, arr) => arr.indexOf(m) === i); // 去重

  let testSuccessful = false;
  let lastError = null;

  for (const testModel of possibleModels) {
    try {
      const modelName = testModel.includes('/') ? testModel : `models/${testModel}`;
      const testUrl = `${baseUrl}/${modelName}:generateContent?key=${apiKey}`;

      results.info.push(`Testing model: ${modelName}`);

      if (!testSuccessful) {
        results.info.push(`Testing URL: ${testUrl.replace(/\?key=.*$/, '?key=***')}`);
      }

      const testPayload = {
        contents: [{
          role: 'user',
          parts: [{ text: 'Hello' }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 10
        }
      };

      const response = await axios.post(testUrl, testPayload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      if (response.status === 200) {
        results.connectionTest = true;
        testSuccessful = true;
        results.info.push(`✅ Gemini API connection test successful with model: ${modelName}!`);

        const data = response.data;
        if (data.candidates && data.candidates.length > 0) {
          const responseText = data.candidates[0].content.parts[0].text;
          results.info.push(`Response received: ${responseText.substring(0, 50)}...`);
        }
        results.info.push(`✅ Recommended model: ${testModel}`);
        break; // 成功後停止嘗試其他模型
      } else {
        lastError = `Unexpected status code: ${response.status}`;
      }
    } catch (error) {
      lastError = error;
      // 繼續嘗試下一個模型（不記錄每個模型的錯誤，只在最後記錄）
      continue;
    }
  }

  // 如果所有模型都失敗，顯示最後的錯誤
  if (!testSuccessful && lastError) {
    results.connectionTest = false;

    if (lastError.response) {
      const status = lastError.response.status;
      const errorData = lastError.response.data;

      results.errors.push(`API Error (${status}): ${JSON.stringify(errorData)}`);

      switch (status) {
        case 400:
          results.errors.push('Bad Request - Check your request format and model name');
          break;
        case 401:
          results.errors.push('Unauthorized - Check if your API key is valid');
          break;
        case 403:
          results.errors.push('Forbidden - Check if Gemini API is enabled in your Google Cloud project');
          break;
        case 404:
          results.errors.push('Not Found - None of the tested models are available');
          results.warnings.push('Tried models: ' + possibleModels.join(', '));
          results.warnings.push('Check available models at: https://ai.google.dev/api');
          break;
        case 429:
          results.errors.push('Rate Limited - Too many requests, please wait');
          break;
        case 500:
        case 502:
        case 503:
          results.errors.push('Server Error - Google API service temporarily unavailable');
          break;
        default:
          results.errors.push(`Unknown error: ${status}`);
      }
    } else if (lastError.request) {
      results.errors.push('Network Error - Could not reach Gemini API');
      results.errors.push(`Error: ${lastError.message}`);
      results.warnings.push('Check your internet connection and firewall settings');
    } else {
      results.errors.push(`Error: ${lastError.message}`);
    }
  }

  return results;
}

/**
 * 打印診斷結果
 */
export function printDiagnosticResults(results) {
  console.log('\n=== Gemini API Diagnostic Results ===\n');

  if (results.errors.length === 0 && results.connectionTest) {
    console.log('✅ All checks passed! Gemini API is configured correctly.\n');
  } else {
    if (results.errors.length > 0) {
      console.log('❌ Errors:');
      results.errors.forEach(error => console.log(`   - ${error}`));
      console.log('');
    }
  }

  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    results.warnings.forEach(warning => console.log(`   - ${warning}`));
    console.log('');
  }

  if (results.info.length > 0) {
    console.log('ℹ️  Info:');
    results.info.forEach(info => console.log(`   - ${info}`));
    console.log('');
  }

  console.log('Configuration:');
  console.log(`   - Has API Key: ${results.hasApiKey ? '✅' : '❌'}`);
  console.log(`   - Has Base URL: ${results.hasBaseUrl ? '✅' : '❌'}`);
  console.log(`   - Connection Test: ${results.connectionTest ? '✅' : '❌'}`);
  console.log('');
}

// 如果直接運行此文件，執行診斷
// 檢查是否是直接運行的腳本
const isMainModule = import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));

if (isMainModule || process.argv[1]?.includes('gemini-diagnostic')) {
  diagnoseGeminiAPI()
    .then(results => {
      printDiagnosticResults(results);
      process.exit(results.errors.length === 0 && results.connectionTest ? 0 : 1);
    })
    .catch(error => {
      console.error('Diagnostic failed:', error);
      process.exit(1);
    });
}

