/**
 * Coordinator - 協調骨架生成和細節填充的核心邏輯
 * 
 * 流程:
 * 1. Phase 1: 生成所有檔案的骨架（單次或分批 API 呼叫）
 * 2. Phase 2: 序列化生成每個檔案的細節（一次一個 agent，確保正確性）
 * 3. Phase 3: 組裝和驗證最終結果
 */

// 載入 dotenv 以讀取 .env 文件中的環境變數
// 從當前文件位置向上查找項目根目錄的 .env 文件
const path = require('path');
const fs = require('fs');

// 嘗試多個可能的 .env 文件路徑
const possibleEnvPaths = [
  path.resolve(__dirname, '../../.env'),  // 從 coordinator.cjs 向上兩級
  path.resolve(process.cwd(), '.env'),    // 從當前工作目錄
  path.join(__dirname, '../../.env'),     // 相對路徑
];

let envPath = null;
for (const possiblePath of possibleEnvPaths) {
  if (fs.existsSync(possiblePath)) {
    envPath = possiblePath;
    break;
  }
}

if (envPath) {
  const result = require('dotenv').config({ path: envPath });
  if (result.error) {
    console.warn(`[Coordinator] Failed to load .env from ${envPath}:`, result.error.message);
  } else {
    console.log(`[Coordinator] Loaded .env from: ${envPath}`);
  }
} else {
  // 如果找不到 .env 文件，嘗試從當前目錄載入（dotenv 默認行為）
  require('dotenv').config();
  console.warn(`[Coordinator] .env file not found in expected locations, using default dotenv behavior`);
}

const logger = require('../shared/logger.cjs');
const DependencyAnalyzer = require('./dependency-analyzer');
const ConfigGenerator = require('./config-generator');

// ContentGenerators will be loaded dynamically when needed (ES module)
let ContentGeneratorsPromise = null;

async function loadContentGenerators() {
  if (ContentGeneratorsPromise) {
    return ContentGeneratorsPromise;
  }
  
  ContentGeneratorsPromise = (async () => {
    try {
      // Use dynamic import for ES module
      const generatorsModule = await import('../generators/index.js');
      return generatorsModule.default || generatorsModule;
    } catch (e) {
      logger.warn('Could not load ContentGenerators, using basic mock generation', null, {
        error: e.message
      });
      return null;
    }
  })();
  
  return ContentGeneratorsPromise;
}

// Polyfill for fetch (Node.js < 18)
const fetch = global.fetch || (async function(...args) {
  const https = require('https');
  const http = require('http');
  const url = args[0];
  const options = args[1] || {};
  
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const req = protocol.request(url, {
      method: options.method || 'GET',
      headers: options.headers || {}
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          json: () => Promise.resolve(JSON.parse(data)),
          text: () => Promise.resolve(data)
        });
      });
    });
    
    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
});

class Coordinator {
  constructor(config = {}) {
    // 依賴分析器
    this.dependencyAnalyzer = new DependencyAnalyzer();
    
    // Worker agents 配置（未來實作時使用）
    this.workers = {
      'markup': { 
        endpoint: config.markupEndpoint || 'http://localhost:3801/generate', 
        exts: ['.html', '.xml', '.md', '.htm'] 
      },
      'style': { 
        endpoint: config.styleEndpoint || 'http://localhost:3802/generate', 
        exts: ['.css', '.scss', '.sass', '.less'] 
      },
      'script': { 
        endpoint: config.scriptEndpoint || 'http://localhost:3803/generate', 
        exts: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs'] 
      },
      'python': { 
        endpoint: config.pythonEndpoint || 'http://localhost:3804/generate', 
        exts: ['.py'] 
      },
      'system': { 
        endpoint: config.systemEndpoint || 'http://localhost:3805/generate', 
        exts: ['.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.java', '.cs'] 
      }
    };
    
    // 配置參數
    this.MAX_FILES_PER_SKELETON_BATCH = config.maxSkeletonBatch || 15;
    this.DETAIL_GENERATION_DELAY = config.detailDelay || 1500; // 毫秒
    
    // 支持多種環境變數名稱（CLOUD_API_* 或 OPENAI_*）
    // 優先使用 Gemini，如果沒有則使用 OpenAI
    let endpoint = config.cloudApiEndpoint || 
      process.env.CLOUD_API_ENDPOINT || 
      process.env.OPENAI_BASE_URL ||
      null;
    
    // 配置 Gemini API（優先）
    this.GEMINI_API_ENDPOINT = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta';
    this.GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    this.GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    // 配置 OpenAI API（備用）
    // 如果端點是 OpenAI 基礎 URL，自動添加 chat/completions 路徑
    if (endpoint && endpoint.includes('api.openai.com')) {
      // 如果已經是完整端點（包含 /chat/completions），保持不變
      if (endpoint.includes('/chat/completions')) {
        // 已經是完整端點，不需要修改
      } else if (endpoint.includes('/v1')) {
        // 如果是 /v1 結尾（如 https://api.openai.com/v1），添加 /chat/completions
        endpoint = endpoint.endsWith('/') 
          ? endpoint + 'chat/completions' 
          : endpoint + '/chat/completions';
      } else {
        // 如果只是基礎 URL（如 https://api.openai.com），添加 /v1/chat/completions
        endpoint = endpoint.endsWith('/') 
          ? endpoint + 'v1/chat/completions' 
          : endpoint + '/v1/chat/completions';
      }
    }
    
    // 如果沒有端點但有 API Key，使用默認的 OpenAI 端點
    if (!endpoint && (process.env.OPENAI_API_KEY || process.env.CLOUD_API_KEY)) {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    }
    
    this.OPENAI_API_ENDPOINT = endpoint;
    this.OPENAI_API_KEY = config.cloudApiKey || 
      process.env.CLOUD_API_KEY || 
      process.env.OPENAI_API_KEY;
    
    // 為了向後兼容，保留舊的變數名（優先使用 Gemini）
    this.CLOUD_API_ENDPOINT = this.GEMINI_API_KEY ? 
      `${this.GEMINI_API_ENDPOINT}/models/${this.GEMINI_MODEL}:generateContent` : 
      this.OPENAI_API_ENDPOINT;
    this.CLOUD_API_KEY = this.GEMINI_API_KEY || this.OPENAI_API_KEY;
    
    // 預設使用 Worker Agents（如果明確要求使用 mock 才用 mock）
    this.USE_MOCK_API = config.useMockApi === true;
    
    // 調試信息：檢查環境變數是否被讀取
    const hasEndpoint = !!(this.CLOUD_API_ENDPOINT);
    const hasKey = !!(this.CLOUD_API_KEY);
    const endpointPreview = this.CLOUD_API_ENDPOINT ? 
      (this.CLOUD_API_ENDPOINT.length > 50 ? this.CLOUD_API_ENDPOINT.substring(0, 50) + '...' : this.CLOUD_API_ENDPOINT) : 
      'not set';
    const keyPreview = this.CLOUD_API_KEY ? 
      (this.CLOUD_API_KEY.length > 10 ? this.CLOUD_API_KEY.substring(0, 10) + '...' : '***') : 
      'not set';
    
    logger.info('Coordinator initialized', null, {
      use_mock_api: this.USE_MOCK_API,
      worker_agents: Object.keys(this.workers).length,
      max_skeleton_batch: this.MAX_FILES_PER_SKELETON_BATCH,
      cloud_api_configured: hasEndpoint && hasKey,
      cloud_api_endpoint: endpointPreview,
      cloud_api_key_set: hasKey,
      env_endpoint: process.env.CLOUD_API_ENDPOINT ? 'set' : 'not set',
      env_key: process.env.CLOUD_API_KEY ? 'set' : 'not set'
    });
  }

  /**
   * 主入口：從 architect payload 生成所有檔案
   */
  async generateFromArchitectPayload(payload, requestId = null) {
    const coderInstructions = payload.output.coder_instructions;
    const files = coderInstructions.files;
    const contracts = coderInstructions.contracts || null; // 可選的 contracts
    
    logger.info('Coordinator starting', requestId, { 
      totalFiles: files.length,
      hasContracts: !!contracts,
      hasProjectConfig: !!coderInstructions.projectConfig,
      useMockApi: this.USE_MOCK_API 
    });

    try {
      // Phase 0: 自動生成配置文件（如果需要）
      logger.info('Phase 0: Generating config files', requestId);
      const configFiles = ConfigGenerator.generateAll(coderInstructions);
      if (configFiles.length > 0) {
        logger.info('Config files generated', requestId, {
          files: configFiles.map(f => f.path)
        });
        // 將配置文件加入到文件列表中
        files.unshift(...configFiles);
      }
      
      // Phase 0.5: 檢測是否需要生成前端檔案
      logger.info('Phase 0.5: Checking for frontend files', requestId);
      const frontendFiles = this.generateFrontendFilesIfNeeded(files, coderInstructions);
      if (frontendFiles.length > 0) {
        logger.info('Frontend files generated', requestId, {
          files: frontendFiles.map(f => f.path)
        });
        // 將前端檔案加入到文件列表中
        files.push(...frontendFiles);
      }
      
      // Phase 1: 生成骨架（傳遞完整的 coder_instructions 包含 contracts）
      logger.info('Phase 1: Generating skeletons', requestId);
      const skeletons = await this.generateAllSkeletons(coderInstructions, requestId);
      
      // Phase 2: 序列化生成細節（傳遞 contracts 和完整的 coderInstructions）
      logger.info('Phase 2: Generating details sequentially', requestId);
      const detailedFiles = await this.generateDetailsSequentially(files, skeletons, contracts, requestId, coderInstructions);
      
      // Phase 3: 組裝（傳遞 payload 以便生成 setup 檔案）
      logger.info('Phase 3: Assembling results', requestId);
      const result = await this.assemble(detailedFiles, skeletons, requestId, payload.output);
      
      logger.info('Coordinator completed', requestId, { 
        filesGenerated: result.files.length,
        configFiles: configFiles.length,
        successful: detailedFiles.filter(f => !f.error).length,
        failed: detailedFiles.filter(f => f.error).length
      });
      
      return result;
      
    } catch (error) {
      logger.error('Coordinator failed', requestId, { 
        error: error.message, 
        stack: error.stack 
      });
      throw error;
    }
  }

  /**
   * Phase 1: 生成所有檔案的骨架（自動分批）
   */
  /**
   * Phase 1: 生成所有檔案的骨架（自動分批）
   * @param {Object} coderInstructions - 包含 files, requirements, contracts, summary
   */
  async generateAllSkeletons(coderInstructions, requestId) {
    const files = Array.isArray(coderInstructions) ? coderInstructions : coderInstructions.files;
    logger.info('Generating skeletons with auto-batching', requestId, { 
      totalFiles: files.length 
    });
    
    // 直接呼叫 generateSkeletonsBatch，它會自動決定是否分批
    // 傳遞完整的 coderInstructions（包含 contracts, summary, requirements）
    // 保存 coderInstructions 以便在 generateSkeletonsViaAPI 中使用
    this.currentCoderInstructions = coderInstructions;
    return await this.generateSkeletonsBatch(coderInstructions, requestId);
  }

  /**
   * 單次或分批生成骨架（自動檢測是否需要分批）
   * @param {Object|Array} coderInstructions - 可以是 {files, contracts} 或純 files[]
   */
  async generateSkeletonsBatch(coderInstructions, requestId) {
    const MAX_FILES_PER_BATCH = 5;  // 每批最多 5 個檔案（避免 token 超限）
    
    // 相容舊格式：如果傳入的是陣列，轉換成物件
    const payload = Array.isArray(coderInstructions) 
      ? { files: coderInstructions } 
      : coderInstructions;
    
    const files = payload.files;
    
    // 如果檔案數 <= 5，單次生成
    if (files.length <= MAX_FILES_PER_BATCH) {
      logger.info('Calling cloud API for skeleton generation (single batch)', requestId, { 
        fileCount: files.length 
      });
      
      return await this.generateSkeletonsSingleBatch(payload, requestId);
    }
    
    // 否則分批生成
    logger.info('Files exceed batch limit, splitting into multiple batches', requestId, { 
      totalFiles: files.length,
      batchSize: MAX_FILES_PER_BATCH
    });
    
    const skeletonMap = {};
    
    // 按語言分組（同類型檔案放一起）
    const batches = [];
    const byLanguage = {};
    
    files.forEach(f => {
      const lang = f.language || 'unknown';
      if (!byLanguage[lang]) byLanguage[lang] = [];
      byLanguage[lang].push(f);
    });
    
    // 將每個語言的檔案分成小批次
    Object.values(byLanguage).forEach(langFiles => {
      for (let i = 0; i < langFiles.length; i += MAX_FILES_PER_BATCH) {
        batches.push(langFiles.slice(i, i + MAX_FILES_PER_BATCH));
      }
    });
    
    logger.info('Created batches for skeleton generation', requestId, {
      totalBatches: batches.length,
      batchSizes: batches.map(b => b.length)
    });
    
    // 逐批生成
    for (let i = 0; i < batches.length; i++) {
      logger.info(`Processing skeleton batch ${i + 1}/${batches.length}`, requestId, {
        filesInBatch: batches[i].length,
        files: batches[i].map(f => f.path)
      });
      
      // 每個 batch 也傳遞 contracts（如果有）
      const batchPayload = {
        files: batches[i],
        contracts: payload.contracts || null,
        requirements: payload.requirements || null
      };
      
      const batchSkeletons = await this.generateSkeletonsSingleBatch(batchPayload, requestId);
      Object.assign(skeletonMap, batchSkeletons);
      
      // 批次間延遲（避免 API rate limit）
      if (i < batches.length - 1) {
        logger.info(`Waiting before next batch...`, requestId);
        await this.sleep(2000);
      }
    }
    
    logger.info('All skeleton batches completed', requestId, {
      totalSkeletons: Object.keys(skeletonMap).length
    });
    
    return skeletonMap;
  }

  /**
   * 單次 API 呼叫生成骨架（不分批）
   * @param {Object} payload - 包含 files, contracts, requirements
   */
  async generateSkeletonsSingleBatch(payload, requestId) {
    // 相容舊格式：如果傳入的是陣列，轉換成物件
    if (Array.isArray(payload)) {
      payload = { files: payload };
    }
    
    const files = payload.files;
    
    logger.info('Calling cloud API for skeleton generation', requestId, { 
      fileCount: files.length 
    });
    
    // 準備 API payload
    const apiPayload = {
      task: 'generate_skeletons',
      instructions: 'Generate code skeletons for all specified files. Include only structure, imports, and signatures. NO implementation details.',
      files: payload.files.map(f => ({
        path: f.path,
        language: f.language,
        description: f.description || '',
        requirements: Array.isArray(f.requirements) ? f.requirements : []
      })),
      constraints: {
        output_format: 'skeleton_only',
        include: ['imports', 'exports', 'class_signatures', 'function_signatures', 'type_definitions', 'docstrings'],
        exclude: ['implementation', 'detailed_logic', 'inline_comments', 'test_code']
      }
    };

    // 呼叫雲端 API
    const response = await this.callCloudAPI(apiPayload, requestId);

    // 解析回傳的骨架
    const skeletonMap = {};
    
    if (response.skeletons && Array.isArray(response.skeletons)) {
      logger.info('Processing skeleton response', requestId, {
        receivedCount: response.skeletons.length,
        expectedCount: files.length
      });
      
      response.skeletons.forEach(skeleton => {
        if (skeleton.path && skeleton.content) {
          skeletonMap[skeleton.path] = skeleton.content;
          logger.debug(`✓ Skeleton for ${skeleton.path}`, requestId, {
            contentLength: skeleton.content.length
          });
        } else {
          logger.warn(`⚠ Invalid skeleton entry`, requestId, { skeleton });
        }
      });
      
      // 檢查是否有檔案缺少骨架，為缺少的檔案生成基本骨架
      const missing = files.filter(f => !skeletonMap[f.path]);
      if (missing.length > 0) {
        logger.warn('Some files missing skeletons, generating fallback skeletons', requestId, {
          missingFiles: missing.map(f => f.path),
          receivedSkeletons: Object.keys(skeletonMap)
        });
        
        // 為缺少的檔案生成基本骨架
        missing.forEach(file => {
          skeletonMap[file.path] = this.generateMockSkeleton(file);
          logger.info(`Generated fallback skeleton for ${file.path}`, requestId);
        });
      }
    } else {
      logger.warn('Invalid skeleton response format, generating all skeletons from mock', requestId, { response });
      
      // 如果回應格式無效，為所有檔案生成 mock 骨架
      files.forEach(file => {
        if (!skeletonMap[file.path]) {
          skeletonMap[file.path] = this.generateMockSkeleton(file);
        }
      });
    }

    // 確保所有檔案都有骨架
    files.forEach(file => {
      if (!skeletonMap[file.path]) {
        logger.warn(`No skeleton for ${file.path}, generating fallback`, requestId);
        skeletonMap[file.path] = this.generateMockSkeleton(file);
    }
    });

    logger.info('Skeletons generated successfully', requestId, { 
      count: Object.keys(skeletonMap).length,
      files: Object.keys(skeletonMap),
      totalExpected: files.length
    });
    
    return skeletonMap;
  }

  /**
   * Phase 2: 根據依賴關係生成細節（併發或序列）
   */
  /**
   * Phase 2: 序列化生成細節（依賴分層，層內併發）
   * @param {Array} files - 檔案列表
   * @param {Object} skeletons - 骨架對應表
   * @param {Object} contracts - 可選的跨檔案 contracts
   * @param {Object} coderInstructions - 完整的 coder instructions（包含 summary, requirements 等）
   */
  async generateDetailsSequentially(files, skeletons, contracts, requestId, coderInstructions = {}) {
    // 分析檔案依賴關係
    const { order, groups, depGraph } = this.dependencyAnalyzer.analyze(files, requestId);
    
    // 視覺化依賴關係（用於除錯）
    this.dependencyAnalyzer.visualizeDependencies(depGraph, groups, requestId);
    
    logger.info('Starting layered detail generation', requestId, { 
      totalFiles: files.length,
      layers: groups.length,
      strategy: groups.length === 1 ? 'all-concurrent' : 'layered-concurrent',
      hasContracts: !!contracts
    });

    const results = [];
    const fileMap = {};
    files.forEach(f => { fileMap[f.path] = f; });

    // 逐層生成（每層內部併發，層與層之間序列）
    for (let layerIdx = 0; layerIdx < groups.length; layerIdx++) {
      const layer = groups[layerIdx];
      const isLastLayer = layerIdx === groups.length - 1;
      
      logger.info(`Processing Layer ${layerIdx + 1}/${groups.length}`, requestId, {
        filesInLayer: layer.length,
        files: layer.map(p => path.basename(p))
      });

      // 層內併發生成
      const layerPromises = layer.map(async (filePath) => {
        const file = fileMap[filePath];
        
        // 🔒 跳過自動生成的配置文件（直接使用 ConfigGenerator 的模板）
        if (file.isAutoGenerated && file.content) {
          logger.info(`⏭ Skipping AI generation for ${file.path} (using template)`, requestId);
          return {
            path: file.path,
            content: file.content,
            language: file.type,
            metadata: { skipped: true, reason: 'auto-generated config file' }
          };
        }
        
        const agent = this.selectAgent(file.path);
        const agentName = this.getAgentName(agent);
        
        try {
          // 建立上下文（包含已完成的依賴檔案 + contracts）
          const deps = depGraph[filePath] || [];
          const completedDeps = results
            .filter(r => !r.error && deps.includes(r.path))
            .map(r => ({ path: r.path, content: r.content, language: r.language }));
          
          const fileSkeleton = skeletons[file.path];
          if (!fileSkeleton) {
            logger.warn(`⚠ No skeleton found for ${file.path}`, requestId);
          }
          
          const context = {
            skeleton: fileSkeleton,
            allSkeletons: skeletons,
            completedFiles: results
              .filter(r => !r.error)
              .map(r => ({ path: r.path, content: r.content, language: r.language })),
            dependencies: completedDeps,
            allFiles: files, // 傳遞所有檔案資訊（用於預知將來的檔案）
            contracts: contracts || null, // ← 新增：傳遞 contracts 給 Worker Agents
            // 傳遞完整的用戶需求和項目信息
            userRequirement: coderInstructions.summary || coderInstructions.requirements || '',
            projectSummary: coderInstructions.summary || '',
            projectRequirements: coderInstructions.requirements || [],
            coderInstructions: coderInstructions, // 傳遞完整的 coder instructions
            fileSpec: {
              path: file.path,
              language: file.language,
              description: file.description || '',
              requirements: file.requirements || []
            }
          };

          // Call worker agent (with built-in fallback)
          const result = await this.generateFileDetail(agent, file, context, requestId);
          
          // Check if result is valid
          if (!result || !result.success) {
            throw new Error(result?.error || 'Unknown error from generateFileDetail');
          }
          
          if (!result.content || result.content.trim() === '') {
            logger.warn(`⚠ Empty content returned for ${file.path}, using skeleton`, requestId);
            // Use skeleton as fallback if content is empty
            return {
              path: file.path,
              content: skeletons[file.path] || `// Empty content for ${file.path}`,
              language: file.language,
              metadata: result.metadata || {},
              layer: layerIdx + 1
            };
          }
          
          // Log success (check if it was a fallback)
          const isFallback = result.metadata?.fallback === true;
          if (isFallback) {
            logger.info(`✓ Generated ${path.basename(file.path)} (via fallback)`, requestId, { 
              layer: layerIdx + 1,
              agent: agentName,
              size: result.content?.length || 0
            });
          } else {
          logger.info(`✅ Generated ${path.basename(file.path)}`, requestId, { 
            layer: layerIdx + 1,
            agent: agentName,
            tokens: result.metadata?.tokens_used,
            size: result.content?.length || 0,
            hasContent: !!(result.content && result.content.trim())
          });
          }

          return {
            path: file.path,
            content: result.content,
            language: file.language,
            metadata: result.metadata || {},
            layer: layerIdx + 1
          };

        } catch (error) {
          // This catch should rarely be triggered now since generateFileDetail has fallback
          // But keep it as a safety net
          logger.warn(`⚠ Fallback to skeleton for ${path.basename(file.path)}`, requestId, { 
            layer: layerIdx + 1,
            error: error.message 
          });
          
          // Use skeleton as final fallback
          return {
            path: file.path,
            content: skeletons[file.path] || `// Error generating ${file.path}: ${error.message}`,
            language: file.language,
            metadata: { fallback: true, error: error.message },
            layer: layerIdx + 1
          };
        }
      });

      // 等待當前層的所有檔案生成完成
      const layerResults = await Promise.all(layerPromises);
      results.push(...layerResults);

      // 層與層之間延遲（最後一層不需要延遲）
      if (!isLastLayer) {
        logger.info(`Layer ${layerIdx + 1} completed, waiting before next layer...`, requestId);
        await this.sleep(this.DETAIL_GENERATION_DELAY);
      }
    }

    const successful = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;
    
    logger.info('Layered generation completed', requestId, { 
      totalLayers: groups.length,
      successful, 
      failed,
      successRate: `${(successful/files.length*100).toFixed(1)}%`
    });

    return results;
  }

  /**
   * Phase 3: 組裝最終結果
   */
  async assemble(detailedFiles, skeletons, requestId, payload = null) {
    const successful = detailedFiles.filter(f => !f.error);
    const failed = detailedFiles.filter(f => f.error);
    
    const notes = [
      `Generated ${detailedFiles.length} files`,
      `✅ Successful: ${successful.length}`,
      failed.length > 0 ? `❌ Failed: ${failed.length}` : null,
      'All files processed via Coordinator'
    ].filter(Boolean);

    // 添加失敗的檔案詳情
    if (failed.length > 0) {
      notes.push('Failed files:');
      failed.forEach(f => {
        notes.push(`  - ${f.path}: ${f.error}`);
      });
    }

    // 收集所有檔案（包括生成的和 setup 檔案）
    let allFiles = detailedFiles.map(f => ({
      path: f.path,
      template: f.content,
      language: f.language
    }));

    // 如果 payload 有 setup 欄位，自動生成 setup 檔案
    if (payload && payload.coder_instructions && payload.coder_instructions.setup) {
      const setupFiles = this.generateSetupFiles(payload.coder_instructions.setup);
      allFiles = allFiles.concat(setupFiles);
      notes.push(`📦 Generated ${setupFiles.length} setup files (package.json, README.md, etc.)`);
    }

    return {
      request_id: `coder-${Date.now()}`,
      received_at: new Date().toISOString(),
      suggested_action: 'generate_files',
      notes: notes,
      files: allFiles,
      metadata: {
        total_files: allFiles.length,
        successful_files: successful.length,
        failed_files: failed.length,
        coordinator_version: '1.0.0',
        generation_method: 'skeleton_then_details'
      }
    };
  }

  /**
   * 根據 setup 配置生成 setup 檔案
   */
  generateSetupFiles(setup) {
    const setupFiles = [];

    // 1. 生成 package.json（如果有 npm 依賴）
    if (setup.dependencies && setup.dependencies.npm && setup.dependencies.npm.length > 0) {
      const packageJson = {
        name: "generated-project",
        version: "1.0.0",
        description: "Auto-generated project",
        scripts: {},
        dependencies: {}
      };

      // 解析依賴（支援 "express@4.18.0" 和 "express" 格式）
      setup.dependencies.npm.forEach(dep => {
        const [name, version] = dep.includes('@') && !dep.startsWith('@') 
          ? dep.split('@') 
          : [dep, 'latest'];
        packageJson.dependencies[name] = version;
      });

      // 添加啟動腳本
      if (setup.startCommands && setup.startCommands.frontend) {
        packageJson.scripts.start = setup.startCommands.frontend;
      }
      if (setup.startCommands && setup.startCommands.backend) {
        packageJson.scripts.server = setup.startCommands.backend;
      }

      setupFiles.push({
        path: 'package.json',
        template: JSON.stringify(packageJson, null, 2),
        language: 'json'
      });
    }

    // 2. 生成 requirements.txt（如果有 python 依賴）
    if (setup.dependencies && setup.dependencies.python && setup.dependencies.python.length > 0) {
      const requirementsTxt = setup.dependencies.python.join('\n');
      setupFiles.push({
        path: 'requirements.txt',
        template: requirementsTxt,
        language: 'text'
      });
    }

    // 3. 生成 pom.xml（如果有 maven 依賴）
    if (setup.dependencies && setup.dependencies.maven && setup.dependencies.maven.length > 0) {
      const pomXml = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    
    <groupId>com.example</groupId>
    <artifactId>generated-project</artifactId>
    <version>1.0.0</version>
    
    <properties>
        <maven.compiler.source>${setup.javaVersion || '17'}</maven.compiler.source>
        <maven.compiler.target>${setup.javaVersion || '17'}</maven.compiler.target>
    </properties>
    
    <dependencies>
${setup.dependencies.maven.map(dep => {
  const [groupArtifact, version] = dep.split(':');
  const [groupId, artifactId] = groupArtifact.split('/');
  return `        <dependency>
            <groupId>${groupId}</groupId>
            <artifactId>${artifactId}</artifactId>
            <version>${version}</version>
        </dependency>`;
}).join('\n')}
    </dependencies>
</project>`;
      setupFiles.push({
        path: 'pom.xml',
        template: pomXml,
        language: 'xml'
      });
    }

    // 4. 生成 go.mod（如果有 go 依賴）
    if (setup.dependencies && setup.dependencies.go && setup.dependencies.go.length > 0) {
      const goMod = `module generated-project

go ${setup.goVersion || '1.21'}

require (
${setup.dependencies.go.map(dep => `\t${dep}`).join('\n')}
)`;
      setupFiles.push({
        path: 'go.mod',
        template: goMod,
        language: 'text'
      });
    }

    // 5. 生成 .env.example（如果有環境變數）
    if (setup.environmentVariables && Object.keys(setup.environmentVariables).length > 0) {
      const envExample = Object.entries(setup.environmentVariables)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      setupFiles.push({
        path: '.env.example',
        template: envExample,
        language: 'text'
      });
    }

    // 6. 生成 README.md
    let readmeContent = '# Generated Project\n\n';
    
    if (setup.instructions) {
      readmeContent += `## Setup Instructions\n\n${setup.instructions}\n\n`;
    }

    if (setup.dependencies) {
      readmeContent += '## Dependencies\n\n';
      if (setup.dependencies.npm) {
        readmeContent += `**Node.js**: ${setup.nodeVersion || 'latest'}\n`;
        readmeContent += '```bash\nnpm install\n```\n\n';
      }
      if (setup.dependencies.python) {
        readmeContent += `**Python**: ${setup.pythonVersion || '3.8+'}\n`;
        readmeContent += '```bash\npip install -r requirements.txt\n```\n\n';
      }
      if (setup.dependencies.maven) {
        readmeContent += `**Java**: ${setup.javaVersion || '17+'}\n`;
        readmeContent += '```bash\nmvn clean install\n```\n\n';
      }
      if (setup.dependencies.go) {
        readmeContent += `**Go**: ${setup.goVersion || '1.21+'}\n`;
        readmeContent += '```bash\ngo mod download\n```\n\n';
      }
    }

    if (setup.startCommands) {
      readmeContent += '## Running the Project\n\n';
      Object.entries(setup.startCommands).forEach(([name, command]) => {
        readmeContent += `**${name}**:\n\`\`\`bash\n${command}\n\`\`\`\n\n`;
      });
    }

    if (setup.environmentVariables) {
      readmeContent += '## Environment Variables\n\n';
      readmeContent += 'Copy `.env.example` to `.env` and fill in the values:\n\n';
      Object.keys(setup.environmentVariables).forEach(key => {
        readmeContent += `- \`${key}\`\n`;
      });
    }

    setupFiles.push({
      path: 'README.md',
      template: readmeContent,
      language: 'markdown'
    });

    // 7. 生成啟動腳本 start.sh / start.bat（如果有 startCommands）
    if (setup.startCommands) {
      // start.sh (Linux/Mac)
      let startSh = '#!/bin/bash\n\n';
      Object.entries(setup.startCommands).forEach(([name, command]) => {
        startSh += `echo "Starting ${name}..."\n${command} &\n\n`;
      });
      startSh += 'wait\n';
      setupFiles.push({
        path: 'start.sh',
        template: startSh,
        language: 'shell'
      });

      // start.bat (Windows)
      let startBat = '@echo off\n\n';
      Object.entries(setup.startCommands).forEach(([name, command]) => {
        startBat += `echo Starting ${name}...\nstart /B ${command}\n\n`;
      });
      setupFiles.push({
        path: 'start.bat',
        template: startBat,
        language: 'batch'
      });
    }

    return setupFiles;
  }

  // ===== Helper Methods =====

  /**
   * 按語言分組檔案
   */
  groupFilesByLanguage(files) {
    const groups = {};
    
    files.forEach(file => {
      const lang = file.language || 'other';
      if (!groups[lang]) groups[lang] = [];
      groups[lang].push(file);
    });

    return groups;
  }

  /**
   * 根據檔案路徑選擇 worker agent
   */
  selectAgent(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    
    for (const [name, worker] of Object.entries(this.workers)) {
      if (worker.exts.includes(ext)) {
        return worker;
      }
    }
    
    // 預設使用 system agent
    return this.workers.system;
  }

  /**
   * 取得 agent 名稱
   */
  getAgentName(agent) {
    for (const [name, worker] of Object.entries(this.workers)) {
      if (worker === agent) return name;
    }
    return 'unknown';
  }

  /**
   * 呼叫雲端 API
   */
  async callCloudAPI(payload, requestId) {
    // Phase 1 骨架生成：使用雲端 API 生成結構化骨架
    if (payload.task === 'generate_skeletons') {
      logger.info('Using Cloud API for skeleton generation', requestId);
      
      // 如果沒有配置 API，fallback 到 mock
      if (!this.CLOUD_API_ENDPOINT || !this.CLOUD_API_KEY) {
        logger.warn('Cloud API not configured, using mock for skeletons', requestId);
        return this.mockCloudAPI(payload, requestId);
      }
      
      // 呼叫雲端 API 生成骨架
      try {
        return await this.generateSkeletonsViaAPI(payload, requestId);
      } catch (error) {
        logger.error('Skeleton API call failed, falling back to mock', requestId, { error: error.message });
        return this.mockCloudAPI(payload, requestId);
      }
    }
    
    // Phase 2 細節生成：根據配置決定使用 mock 還是 Worker Agents
    if (this.USE_MOCK_API) {
      return this.mockCloudAPI(payload, requestId);
    }

    // 真實 API 呼叫（目前不會到達這裡，因為 Phase 2 用 Worker Agents）
    try {
      const response = await fetch(this.CLOUD_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.CLOUD_API_KEY}`,
          'X-Request-ID': requestId || 'no-request-id'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloud API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      return await response.json();
      
    } catch (error) {
      logger.error('Cloud API call failed', requestId, { error: error.message });
      throw error;
    }
  }

  /**
   * 使用 Cloud API 生成骨架
   */
  async generateSkeletonsViaAPI(payload, requestId) {
    logger.info('Calling Cloud API to generate skeletons', requestId, { 
      fileCount: payload.files.length 
    });

    // 建構 prompt：要求 LLM 生成所有檔案的結構化骨架
    // 如果 payload 包含 contracts，則強制遵循；否則由 LLM 推斷一致性
    const hasContracts = payload.contracts && Object.keys(payload.contracts).length > 0;
    
    const systemPrompt = `You are an expert code architect. Generate structural skeletons for application files (web, mobile, backend, CLI, etc.).

Your task:
1. Generate file structure with:
   - Import statements
   - Function/class signatures
   - Type definitions
   - Key comments describing responsibilities
2. DO NOT implement logic - only structure
3. CRITICAL CONSISTENCY RULES (apply to ALL file types):
   - Cross-file references MUST be exact (HTML IDs → CSS selectors → JS querySelector)
   - Data attributes: HTML data-* values MUST match JS event handler checks exactly
   - Function names: HTML onclick/event references → JS function names must match
   - File paths: <link>/<script> src → actual file names must match
   - Variable naming: Shared concepts across files use consistent naming (camelCase in JS, snake_case in Python)
${hasContracts ? `
4. CONTRACT ENFORCEMENT (HIGHEST PRIORITY):
   The payload includes explicit contracts for cross-file communication.
   You MUST follow these contracts EXACTLY - no interpretation, no assumptions.
   
   For API contracts:
   - Include skeleton comments with EXACT request/response structure from contract
   - Frontend and backend MUST use IDENTICAL field names
   - Example: 
     /* API Contract: POST /api/orders
      * Request: { customer: {name: string, email: string}, items: [{productId: string, quantity: number}] }
      * Response: { orderId: string, total: number, status: string }
      */
   - Python: Use TypedDict/Pydantic models matching contract EXACTLY
   - JavaScript: Use JSDoc @typedef matching contract EXACTLY
   
   For module contracts:
   - Export functions MUST match signatures in contract
   - Import statements MUST reference correct module names
   
   For event contracts:
   - Event names and payload structures MUST match contract
   - dispatchEvent() and addEventListener() must use exact event names
   
   For storage contracts:
   - localStorage/sessionStorage keys MUST match contract
   - Data structures stored MUST match contract schema
   
   For class contracts:
   - Class fields and methods MUST match contract definition
   - Serialization methods (to_dict, toJSON) MUST follow contract structure
` : `
4. INFERRED CONSISTENCY (when no explicit contracts provided):
   - For API endpoints: Infer minimal REST-style payloads from descriptions
   - Document inferred structure in skeleton comments
   - Use standard conventions (e.g., {id, name, ...} for entities)
   - Keep structures simple and predictable
`}
5. Language-specific best practices:
   - HTML: Semantic tags, accessibility attributes
   - CSS: BEM naming, mobile-first, CSS Grid/Flexbox
   - JavaScript: ES6+, async/await, error handling
   - Python: Type hints, docstrings, PEP 8
   - Java: Interfaces, generics, JavaDoc
6. JSON OUTPUT REQUIREMENTS:
   - Output MUST be valid JSON array: [{"path": "...", "content": "..."}, ...]
   - For multi-line content, use actual newlines inside the JSON string (this is valid JSON)
   - You may wrap the JSON in markdown code block (triple backticks + json) for clarity
   - The content field should contain the code as-is without extra escaping
`;

    // 提取用戶需求（從 coderInstructions 或 payload）
    const coderInstructions = this.currentCoderInstructions || {};
    const userRequirement = payload.summary || payload.requirements || coderInstructions.summary || coderInstructions.requirements || '';
    const projectRequirements = Array.isArray(payload.requirements) ? payload.requirements : (payload.requirements ? [payload.requirements] : []);
    
    let userPrompt = `Generate skeletons for these files:

${userRequirement ? `=== USER REQUIREMENT ===
${userRequirement}

` : ''}${projectRequirements.length > 0 ? `=== PROJECT REQUIREMENTS ===
${projectRequirements.join('\n')}

` : ''}Files to generate:
${payload.files.map((f, i) => `${i + 1}. ${f.path} (${f.type}): ${f.description || 'No description'}${f.requirements && f.requirements.length > 0 ? `\n   Requirements: ${Array.isArray(f.requirements) ? f.requirements.join(', ') : f.requirements}` : ''}`).join('\n')}
`;

    // 如果有 contracts，附加到 prompt
    if (hasContracts) {
      userPrompt += `\n\n=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      if (payload.contracts.api && payload.contracts.api.length > 0) {
        userPrompt += `\nAPI Endpoints:\n`;
        payload.contracts.api.forEach((api, i) => {
          userPrompt += `${i + 1}. ${api.endpoint} - ${api.description}\n`;
          userPrompt += `   Request: ${JSON.stringify(api.request, null, 2)}\n`;
          userPrompt += `   Response: ${JSON.stringify(api.response, null, 2)}\n`;
          userPrompt += `   Producers: ${api.producers.join(', ')}\n`;
          userPrompt += `   Consumers: ${api.consumers.join(', ')}\n\n`;
        });
      }
      
      if (payload.contracts.modules && payload.contracts.modules.length > 0) {
        userPrompt += `\nModules:\n`;
        payload.contracts.modules.forEach((mod, i) => {
          userPrompt += `${i + 1}. ${mod.name} (${mod.file})\n`;
          userPrompt += `   Exports: ${JSON.stringify(mod.exports, null, 2)}\n`;
          userPrompt += `   Importers: ${mod.importers.join(', ')}\n\n`;
        });
      }
      
      if (payload.contracts.events && payload.contracts.events.length > 0) {
        userPrompt += `\nCustom Events:\n`;
        payload.contracts.events.forEach((evt, i) => {
          userPrompt += `${i + 1}. ${evt.name} - ${evt.description}\n`;
          userPrompt += `   Payload: ${JSON.stringify(evt.payload, null, 2)}\n`;
          userPrompt += `   Emitters: ${evt.emitters.join(', ')}\n`;
          userPrompt += `   Listeners: ${evt.listeners.join(', ')}\n\n`;
        });
      }
      
      if (payload.contracts.storage && payload.contracts.storage.length > 0) {
        userPrompt += `\nStorage:\n`;
        payload.contracts.storage.forEach((store, i) => {
          userPrompt += `${i + 1}. ${store.key} (${store.type}) - ${store.description}\n`;
          userPrompt += `   Schema: ${JSON.stringify(store.schema, null, 2)}\n`;
          userPrompt += `   Writers: ${store.writers.join(', ')}\n`;
          userPrompt += `   Readers: ${store.readers.join(', ')}\n\n`;
        });
      }
      
      if (payload.contracts.classes && payload.contracts.classes.length > 0) {
        userPrompt += `\nShared Classes:\n`;
        payload.contracts.classes.forEach((cls, i) => {
          userPrompt += `${i + 1}. ${cls.name} (${cls.file})\n`;
          userPrompt += `   Fields: ${JSON.stringify(cls.fields, null, 2)}\n`;
          if (cls.methods) userPrompt += `   Methods: ${JSON.stringify(cls.methods, null, 2)}\n`;
          userPrompt += `   Consumers: ${cls.consumers.join(', ')}\n\n`;
        });
      }
      
      userPrompt += `\n=== END CONTRACTS ===\n`;
    }

    // 為 HTML 檔案計算相對路徑
    const htmlFiles = payload.files.filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
    const cssFiles = payload.files.filter(f => f.path.endsWith('.css'));
    const jsFiles = payload.files.filter(f => f.path.endsWith('.js') || f.path.endsWith('.mjs') || f.path.endsWith('.cjs'));
    
    if (htmlFiles.length > 0 && (cssFiles.length > 0 || jsFiles.length > 0)) {
      userPrompt += `\n=== FILE PATH RELATIONSHIPS ===\n`;
      htmlFiles.forEach(htmlFile => {
        const htmlDir = path.dirname(htmlFile.path);
        userPrompt += `\nFor HTML file: ${htmlFile.path}\n`;
        if (cssFiles.length > 0) {
          userPrompt += `  CSS files (use relative paths from HTML directory):\n`;
          cssFiles.forEach(cssFile => {
            const relPath = path.relative(htmlDir, cssFile.path).replace(/\\/g, '/');
            userPrompt += `    - ${cssFile.path} → use "${relPath}" in <link> tag\n`;
          });
        }
        if (jsFiles.length > 0) {
          userPrompt += `  JS files (use relative paths from HTML directory):\n`;
          jsFiles.forEach(jsFile => {
            const relPath = path.relative(htmlDir, jsFile.path).replace(/\\/g, '/');
            userPrompt += `    - ${jsFile.path} → use "${relPath}" in <script> tag\n`;
          });
        }
      });
      userPrompt += `\nCRITICAL: HTML files MUST use the exact relative paths shown above.\n`;
      userPrompt += `Do NOT invent paths like "styles/main.css" or "scripts/main.js".\n`;
      userPrompt += `CRITICAL: Match the EXACT filename from the relative path (e.g., if path is "index.js", use src="index.js", NOT "app.js" or "main.js").\n`;
      userPrompt += `=== END FILE PATH RELATIONSHIPS ===\n\n`;
    }

    userPrompt += `
Generate structural skeletons following language conventions:
- HTML: DOCTYPE, head, body structure, script/link tags with CORRECT relative file paths (see above)
- CSS: Selectors matching HTML classes/IDs
- JavaScript: Function signatures, class definitions, imports, event listeners
- Python: Class/function definitions, imports, type hints, route handlers
- Java: Package declarations, imports, class/interface definitions

${hasContracts ? 
'IMPORTANT: Follow the contracts EXACTLY. Every field name, type, and structure must match.' :
'CONSISTENCY CHECK: Infer consistent structures across files. Every frontend API call should have a backend route.'}

IMPORTANT: Your response must be VALID JSON that can be parsed by JSON.parse().
Ensure all special characters are properly escaped according to JSON specification.
Do not include any text before or after the JSON array.

Return ONLY the JSON array, no markdown or explanation.`;

    // 優先嘗試 Gemini，失敗時切換到 OpenAI（一次只使用一個 API）
    const apiProviders = [];
    
    // 優先添加 Gemini
    if (this.GEMINI_API_KEY) {
      apiProviders.push({
        name: 'Gemini',
        endpoint: `${this.GEMINI_API_ENDPOINT}/models/${this.GEMINI_MODEL}:generateContent`,
        key: this.GEMINI_API_KEY,
        isGemini: true
      });
    }
    
    // 然後添加 OpenAI（備用）
    if (this.OPENAI_API_ENDPOINT && this.OPENAI_API_KEY) {
      apiProviders.push({
        name: 'OpenAI',
        endpoint: this.OPENAI_API_ENDPOINT,
        key: this.OPENAI_API_KEY,
        isGemini: false
      });
    }
    
    if (apiProviders.length === 0) {
      throw new Error('No API providers configured (neither Gemini nor OpenAI)');
    }
    
    let lastError = null;
    
    // 依次嘗試每個 API 提供者（優先 Gemini）
    for (const provider of apiProviders) {
      try {
        logger.info(`Trying ${provider.name} API for skeleton generation`, requestId);
        
        let requestBody, headers, apiUrl, response, result, generatedText;
        
        if (provider.isGemini) {
          // Gemini API 格式
          requestBody = {
            contents: [{
              parts: [{
                text: `${systemPrompt}\n\n${userPrompt}`
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 16384
            }
          };
          
          headers = {
            'Content-Type': 'application/json'
          };
          
          // Gemini 使用 query parameter 認證
          apiUrl = `${provider.endpoint}?key=${provider.key}`;
          
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            const statusCode = response.status;
            const errorCode = JSON.parse(errorText || '{}')?.error?.code;
            
            // 如果是配額錯誤或認證錯誤，嘗試下一個提供者
            if (statusCode === 429 || errorCode === 'insufficient_quota' || statusCode === 401 || statusCode === 403) {
              logger.warn(`${provider.name} API failed (${statusCode || errorCode}), switching to next provider...`, requestId);
              lastError = new Error(`${provider.name} API error: ${statusCode} - ${errorText}`);
              continue; // 嘗試下一個提供者
            }
            throw new Error(`Gemini API error: ${statusCode} - ${errorText}`);
          }

          result = await response.json();
          generatedText = result.candidates[0].content.parts[0].text;
          
        } else {
          // OpenAI API 格式
          requestBody = {
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            max_tokens: 4000
          };
          
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.key}`
          };
          
          response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            const statusCode = response.status;
            const errorCode = JSON.parse(errorText || '{}')?.error?.code;
            
            // 如果是配額錯誤或認證錯誤，嘗試下一個提供者
            if (statusCode === 429 || errorCode === 'insufficient_quota' || statusCode === 401 || statusCode === 403) {
              logger.warn(`${provider.name} API failed (${statusCode || errorCode}), switching to next provider...`, requestId);
              lastError = new Error(`OpenAI API error: ${statusCode} - ${errorText}`);
              continue; // 嘗試下一個提供者
            }
            throw new Error(`OpenAI API error: ${statusCode} - ${errorText}`);
          }

          result = await response.json();
          generatedText = result.choices[0].message.content;
        }
        
        logger.info('Raw API response received', requestId, {
          provider: provider.name,
          textLength: generatedText.length,
          preview: generatedText.substring(0, 200)
        });
        
        // 移除可能的 markdown code block 包裝
        let cleanedText = generatedText.trim();
        if (cleanedText.startsWith('```json')) {
          cleanedText = cleanedText.replace(/^```json\s*\n/, '').replace(/\n```\s*$/, '');
        } else if (cleanedText.startsWith('```')) {
          cleanedText = cleanedText.replace(/^```\s*\n/, '').replace(/\n```\s*$/, '');
        }
        
        // 解析 JSON
        const jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          logger.error('No JSON array found in response', requestId, {
            fullText: cleanedText.substring(0, 2000)
          });
          throw new Error('API response does not contain valid JSON array');
        }
        
        let skeletons;
        try {
          skeletons = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          logger.error('JSON parse failed', requestId, {
            error: parseError.message,
            jsonPreview: jsonMatch[0].substring(0, 1000),
            jsonLength: jsonMatch[0].length
          });
          
          // 嘗試修復常見的轉義問題
          try {
            let fixedJson = jsonMatch[0]
              .replace(/\\\\\\\\/g, '\\')
              .replace(/\\\\\"/g, '"')
              .replace(/\\\\n/g, '\\n');
            
            skeletons = JSON.parse(fixedJson);
            logger.info('JSON parse succeeded after fixing escaping', requestId);
          } catch (fixError) {
            logger.error('JSON fix attempt also failed', requestId, {
              fixError: fixError.message
            });
            throw new Error(`Failed to parse JSON: ${parseError.message}`);
          }
        }
        
        logger.info('Skeleton generation via API completed', requestId, {
          provider: provider.name,
          fileCount: skeletons.length,
          tokensUsed: provider.isGemini ? (result.usageMetadata?.totalTokenCount || 0) : (result.usage?.total_tokens || 0)
        });
        
        return { skeletons };
        
      } catch (error) {
        lastError = error;
        // 如果還有其他提供者可以嘗試，繼續
        if (apiProviders.indexOf(provider) < apiProviders.length - 1) {
          logger.warn(`${provider.name} API request failed, trying next provider...`, requestId, {
            error: error.message
          });
          continue;
        }
        // 如果是最後一個提供者，拋出錯誤
        logger.error('Failed to generate skeletons via API', requestId, { 
          error: error.message,
          triedProviders: apiProviders.map(p => p.name).join(', ')
        });
        throw error;
      }
    }
    
    // 所有提供者都失敗了
    throw lastError || new Error('All API providers failed');
  }

  /**
   * 使用 Cloud API 生成檔案細節
   */
  async generateDetailsViaCloudAPI(payload, requestId) {
    logger.info('Calling Cloud API to generate file details', requestId, { 
      file: payload.fileSpec?.path 
    });

    const fileSpec = payload.fileSpec || {};
    const skeleton = payload.skeleton || '';
    const context = payload.context || {};
    
    const systemPrompt = `You are an expert software developer. Generate complete, production-ready code implementations.

Your task:
1. Take the provided skeleton code and expand it into a complete, working implementation
2. Include all necessary functionality, error handling, and best practices
3. Ensure code is well-structured, readable, and follows language conventions
4. Add appropriate comments for complex logic
5. Ensure consistency with related files (if provided in context)

Requirements:
- Generate COMPLETE, WORKING code (not just placeholders)
- Include proper error handling
- Follow best practices for the language
- Maintain consistency with skeleton structure
- If context includes completed files, ensure compatibility`;

    // 構建包含用戶需求的完整 prompt
    const userRequirement = context.userRequirement || context.projectSummary || '';
    const projectRequirements = context.projectRequirements || [];
    
    const userPrompt = `Generate complete implementation for: ${fileSpec.path}

${userRequirement ? `=== USER REQUIREMENT ===
${userRequirement}

` : ''}${projectRequirements.length > 0 ? `=== PROJECT REQUIREMENTS ===
${Array.isArray(projectRequirements) ? projectRequirements.join('\n') : projectRequirements}

` : ''}File Type: ${fileSpec.language || 'unknown'}
Description: ${fileSpec.description || 'No description'}
${fileSpec.requirements && fileSpec.requirements.length > 0 ? `
File-Specific Requirements:
${Array.isArray(fileSpec.requirements) ? fileSpec.requirements.join('\n') : fileSpec.requirements}
` : ''}

Skeleton Code:
\`\`\`${fileSpec.language || 'text'}
${skeleton}
\`\`\`

${context.completedFiles && context.completedFiles.length > 0 ? `
Related Files (for reference):
${context.completedFiles.map(f => `- ${f.path} (${f.language})`).join('\n')}
` : ''}

${context.dependencies && context.dependencies.length > 0 ? `
Dependencies:
${context.dependencies.map(d => `- ${d.path}`).join('\n')}
` : ''}

Generate the complete implementation now. 

CRITICAL REQUIREMENTS:
- The code MUST implement the user's requirement: "${userRequirement || 'see description above'}"
- Return ONLY the code content, no explanations, no apologies, no markdown formatting
- For JSON files: Return valid JSON only, no text before or after
- For JavaScript files: Return complete, working code that fulfills the user's requirement
- For config files: Return appropriate configuration based on file path (backend config should export module.exports, frontend config should use window.APP_CONFIG)
- If the skeleton is empty or unclear, infer reasonable defaults based on the user requirement and file path/description
- The implementation should be specific to the user's needs, not a generic template

DO NOT include phrases like "Apologies", "I'm sorry", "Here's the code", etc. Just return the code directly.`;

    // 優先嘗試 Gemini，失敗時切換到 OpenAI（一次只使用一個 API）
    const apiProviders = [];
    
    // 優先添加 Gemini
    if (this.GEMINI_API_KEY) {
      apiProviders.push({
        name: 'Gemini',
        endpoint: `${this.GEMINI_API_ENDPOINT}/models/${this.GEMINI_MODEL}:generateContent`,
        key: this.GEMINI_API_KEY,
        isGemini: true
      });
    }
    
    // 然後添加 OpenAI（備用）
    if (this.OPENAI_API_ENDPOINT && this.OPENAI_API_KEY) {
      apiProviders.push({
        name: 'OpenAI',
        endpoint: this.OPENAI_API_ENDPOINT,
        key: this.OPENAI_API_KEY,
        isGemini: false
      });
    }
    
    if (apiProviders.length === 0) {
      throw new Error('No API providers configured (neither Gemini nor OpenAI)');
    }
    
    let lastError = null;
    
    // 依次嘗試每個 API 提供者（優先 Gemini）
    for (const provider of apiProviders) {
      try {
        logger.info(`Trying ${provider.name} API for detail generation`, requestId, {
          file: fileSpec.path
        });
        
        let requestBody, headers, apiUrl, response, result, generatedText;
        
        if (provider.isGemini) {
          // Gemini API 格式
          requestBody = {
            contents: [{
              parts: [{
                text: `${systemPrompt}\n\n${userPrompt}`
              }]
            }],
            generationConfig: {
              temperature: 0.5,
              maxOutputTokens: 8192
            }
          };
          
          headers = {
            'Content-Type': 'application/json'
          };
          
          apiUrl = `${provider.endpoint}?key=${provider.key}`;
          
          response = await fetch(apiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            const statusCode = response.status;
            const errorCode = JSON.parse(errorText || '{}')?.error?.code;
            
            // 如果是配額錯誤或認證錯誤，嘗試下一個提供者
            if (statusCode === 429 || errorCode === 'insufficient_quota' || statusCode === 401 || statusCode === 403) {
              logger.warn(`${provider.name} API failed (${statusCode || errorCode}), switching to next provider...`, requestId, {
                file: fileSpec.path
              });
              lastError = new Error(`Gemini API error: ${statusCode} - ${errorText}`);
              continue; // 嘗試下一個提供者
            }
            throw new Error(`Gemini API error: ${statusCode} - ${errorText}`);
          }

          result = await response.json();
          generatedText = result.candidates[0].content.parts[0].text;
          
        } else {
          // OpenAI API 格式
          requestBody = {
            model: 'gpt-4',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.5,
            max_tokens: 4000
          };
          
          headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.key}`
          };
          
          response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(requestBody)
          });

          if (!response.ok) {
            const errorText = await response.text();
            const statusCode = response.status;
            const errorCode = JSON.parse(errorText || '{}')?.error?.code;
            
            // 如果是配額錯誤或認證錯誤，嘗試下一個提供者
            if (statusCode === 429 || errorCode === 'insufficient_quota' || statusCode === 401 || statusCode === 403) {
              logger.warn(`${provider.name} API failed (${statusCode || errorCode}), switching to next provider...`, requestId, {
                file: fileSpec.path
              });
              lastError = new Error(`OpenAI API error: ${statusCode} - ${errorText}`);
              continue; // 嘗試下一個提供者
            }
            throw new Error(`OpenAI API error: ${statusCode} - ${errorText}`);
          }

          result = await response.json();
          generatedText = result.choices[0].message.content;
        }
        
        // 移除可能的 markdown code block 包裝和錯誤訊息
        let content = generatedText.trim();
        
        // 檢查是否包含錯誤訊息（API 可能返回錯誤而不是代碼）
        if (content.toLowerCase().includes('apologies') || 
            content.toLowerCase().includes('i\'m sorry') ||
            content.toLowerCase().includes('i cannot') ||
            content.toLowerCase().includes('unclear') ||
            content.toLowerCase().includes('confusion') ||
            content.toLowerCase().includes('not clear')) {
          logger.warn('Cloud API returned error message instead of code, using skeleton', requestId, {
            file: fileSpec.path,
            preview: content.substring(0, 200)
          });
          // 使用骨架作為 fallback
          content = skeleton || '';
        }
        
        // 移除 markdown code block 包裝
        if (content.startsWith('```')) {
          content = content.replace(/^```[\w]*\s*\n/, '').replace(/\n```\s*$/, '');
        }
        
        // 移除常見的前綴文字
        content = content.replace(/^(here's|here is|the code|code:|implementation:)\s*/i, '');
        
        logger.info('Detail generation via Cloud API completed', requestId, {
          provider: provider.name,
          file: fileSpec.path,
          contentLength: content.length,
          tokensUsed: provider.isGemini ? (result.usageMetadata?.totalTokenCount || 0) : (result.usage?.total_tokens || 0)
        });
        
        return {
          content: content,
          metadata: {
            tokens_used: provider.isGemini ? (result.usageMetadata?.totalTokenCount || 0) : (result.usage?.total_tokens || 0),
            model: provider.isGemini ? 'gemini-2.5-flash' : 'gpt-4',
            method: 'cloud_api'
          }
        };
        
      } catch (error) {
        lastError = error;
        // 如果還有其他提供者可以嘗試，繼續
        if (apiProviders.indexOf(provider) < apiProviders.length - 1) {
          logger.warn(`${provider.name} API request failed, trying next provider...`, requestId, {
            file: fileSpec.path,
            error: error.message
          });
          continue;
        }
        // 如果是最後一個提供者，拋出錯誤
        logger.error('Failed to generate details via Cloud API', requestId, {
          error: error.message,
          file: fileSpec.path,
          triedProviders: apiProviders.map(p => p.name).join(', ')
        });
        throw error;
      }
    }
    
    // 所有提供者都失敗了
    throw lastError || new Error('All API providers failed');
  }

  /**
   * Mock Cloud API（用於測試和開發）
   */
  mockCloudAPI(payload, requestId) {
    logger.info('Using mock cloud API', requestId, { task: payload.task });
    
    if (payload.task === 'generate_skeletons') {
      // 生成骨架的 mock 回應
      const skeletons = payload.files.map(file => {
        const skeleton = this.generateMockSkeleton(file);
        return {
          path: file.path,
          content: skeleton
        };
      });

      return Promise.resolve({ skeletons });
      
    } else if (payload.task === 'fill_details') {
      // 生成細節的 mock 回應（異步處理以支持 ContentGenerators）
      return this.generateMockDetailedContentAsync(payload.context);
    }

    return Promise.reject(new Error(`Unknown mock task: ${payload.task}`));
  }

  /**
   * 生成 mock 骨架（改進版，生成更完整的骨架）
   */
  generateMockSkeleton(file) {
    const ext = path.extname(file.path).toLowerCase();
    const description = file.description || file.path;
    
    switch (ext) {
      case '.html':
      case '.htm':
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${description}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>${description}</h1>
        </header>
        <main>
            <p>Content goes here</p>
        </main>
    </div>
    <script src="script.js"></script>
</body>
</html>`;

      case '.css':
      case '.scss':
        return `/* ${description} */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}`;

      case '.js':
      case '.jsx':
      case '.mjs':
      case '.cjs':
        // 根據檔案名稱判斷類型
        const isCalculator = file.path.toLowerCase().includes('calculator') || 
                            description.toLowerCase().includes('calculator') ||
                            description.toLowerCase().includes('計算');
        
        if (isCalculator) {
          return `// Calculator JavaScript
let display = document.getElementById('display');
let currentInput = '';

function appendToDisplay(value) {
    currentInput += value;
    if (display) display.value = currentInput;
}

function clearDisplay() {
    currentInput = '';
    if (display) display.value = '';
}

function deleteLast() {
    currentInput = currentInput.slice(0, -1);
    if (display) display.value = currentInput;
}

function calculate() {
    try {
        const result = eval(currentInput);
        currentInput = String(result);
        if (display) display.value = currentInput;
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    display = document.getElementById('display');
});`;
        }
        
        // 一般 JavaScript 檔案
        return `// ${description}

// Main functionality
function init() {
    console.log('${file.path} initialized');
}

// Event listeners
document.addEventListener('DOMContentLoaded', init);`;

      case '.json':
        // 根據檔案名稱生成不同的 JSON 結構
        const fileName = file.path.toLowerCase();
        if (fileName.includes('package.json')) {
          return JSON.stringify({
            name: "generated-project",
            version: "1.0.0",
            description: description || "Generated project",
            main: "server.js",
            scripts: {
              start: "node server.js",
              dev: "node server.js"
            },
            dependencies: {
              express: "^4.18.2"
            }
          }, null, 2);
        } else if (fileName.includes('calculation') || fileName.includes('data')) {
          return JSON.stringify({
            calculations: [],
            metadata: {
              generated: new Date().toISOString(),
              description: description || "Calculation data"
            }
          }, null, 2);
        } else {
          return JSON.stringify({
            data: [],
            metadata: {
              generated: new Date().toISOString(),
              description: description || "Data file"
    }
          }, null, 2);
        }

      case '.py':
        return `"""
${description}
"""

def main():
    """Main function"""
    print('${file.path} started')

if __name__ == '__main__':
    main()`;

      case '.md':
        return `# ${description}

## Description

${description}

## Usage

Add usage instructions here.`;

      default:
        // 根據檔案路徑判斷可能的類型
        if (file.path.includes('package.json') || file.path.includes('package')) {
          return JSON.stringify({
            name: "generated-project",
            version: "1.0.0",
            description: description,
            main: "index.js",
            scripts: {
              start: "node index.js"
            },
            dependencies: {}
          }, null, 2);
        }
        
        if (file.path.includes('server') || (file.path.includes('index') && file.path.endsWith('.js') && !file.path.includes('public'))) {
          return `const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// API routes
app.post('/api/calculate', (req, res) => {
    try {
        const { expression } = req.body;
        const result = eval(expression);
        res.json({ result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
});`;
        }
        
        return `// ${description}

// Implementation for ${file.path}
// Add your code here`;
    }
  }

  /**
   * 異步生成 mock 詳細內容（使用 ContentGenerators 生成完整內容）
   */
  async generateMockDetailedContentAsync(context) {
    if (!context || !context.skeleton) {
      return {
        content: '// Error: No skeleton provided',
        metadata: {
          tokens_used: 0,
          model: 'mock-model-v1'
        }
      };
    }

    const skeleton = context.skeleton;
    const fileSpec = context.fileSpec || {};
    const ext = path.extname(fileSpec.path || '').toLowerCase();
    
    // 嘗試使用 ContentGenerators 生成更完整的內容
    try {
      const ContentGenerators = await loadContentGenerators();
      if (ContentGenerators) {
        const generators = new ContentGenerators();
        
        // 根據檔案類型選擇生成方法
        if (['.html', '.htm'].includes(ext)) {
          const generated = generators.generateHTML(fileSpec, skeleton);
          if (generated && generated.length > skeleton.length) {
            return {
              content: generated,
              metadata: {
                tokens_used: Math.floor(Math.random() * 3000) + 1000,
                model: 'mock-model-v1-with-generators'
              }
            };
          }
        } else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
          const generated = generators.generateJavaScript(fileSpec, skeleton, context);
          if (generated && generated.length > skeleton.length) {
            return {
              content: generated,
              metadata: {
                tokens_used: Math.floor(Math.random() * 3000) + 1000,
                model: 'mock-model-v1-with-generators'
              }
            };
          }
        } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
          // 對於 CSS，需要檢查 HTML 文件
          const htmlFiles = context.allFiles?.filter(f => 
            ['.html', '.htm'].includes(path.extname(f.path || '').toLowerCase())
          ) || [];
          const generated = generators.generateCSS(fileSpec, htmlFiles);
          if (generated) {
            return {
              content: generated,
              metadata: {
                tokens_used: Math.floor(Math.random() * 2000) + 500,
                model: 'mock-model-v1-with-generators'
              }
            };
          }
        }
      }
    } catch (error) {
      logger.debug(`ContentGenerators failed for ${fileSpec.path}, using basic fallback`, null, {
        error: error.message
      });
    }
    
    // Fallback: 基本擴充骨架
    let content = skeleton;
    
    // 根據檔案類型添加基本實作
    if (['.html', '.htm'].includes(ext)) {
      // HTML: 確保有基本結構並修復錯誤引用
      if (content.includes('TODO') || content.length < 200) {
        content = content.replace(/<!--\s*TODO[^-]*-->/gi, '');
        
        // 修復錯誤的 script 引用（不應該引用 server.js 或 config.js）
        content = content.replace(/<script[^>]*src=['"]server\.js['"][^>]*><\/script>/gi, '');
        content = content.replace(/<script[^>]*src=['"]config\.js['"][^>]*><\/script>/gi, '');
        
        // 根據檔案位置決定正確的 script 引用
        const filePath = fileSpec.path || '';
        const isPublicFile = filePath.includes('public/');
        const scriptSrc = isPublicFile ? 'index.js' : 'public/index.js';
        
        if (content.includes('<body>') && content.match(/<body>[\s\S]*?<\/body>/i)?.[0].length < 100) {
          content = content.replace(
            /<body>([\s\S]*?)<\/body>/i,
            `<body>
    <div class="container">
        <header>
            <h1>${fileSpec.description || 'Application'}</h1>
        </header>
        <main>
            <div class="content">
                <p>Welcome to the application</p>
            </div>
        </main>
    </div>
    <script src="${scriptSrc}"></script>
</body>`
          );
        } else if (!content.includes(`<script src="${scriptSrc}">`)) {
          // 如果 body 有內容但沒有 script，添加 script
          content = content.replace(/<\/body>/i, `    <script src="${scriptSrc}"></script>\n</body>`);
        }
      }
      
      // 確保有正確的 CSS 引用
      if (!content.includes('style.css') && !content.includes('styles.css')) {
        const filePath = fileSpec.path || '';
        const isPublicFile = filePath.includes('public/');
        const cssHref = isPublicFile ? 'style.css' : 'public/style.css';
        content = content.replace(/<\/head>/i, `    <link rel="stylesheet" href="${cssHref}">\n</head>`);
      }
      
      // 修復錯誤的 CSS 引用（如 css/styles.css 應該改為 style.css）
      content = content.replace(/href=['"]css\/styles\.css['"]/gi, 'href="style.css"');
      content = content.replace(/href=['"]styles\.css['"]/gi, 'href="style.css"');
      
      // 修復錯誤的 JS 引用（如 js/index.js 應該改為 index.js）
      content = content.replace(/src=['"]js\/index\.js['"]/gi, 'src="index.js"');
      content = content.replace(/src=['"]js\/script\.js['"]/gi, 'src="index.js"');
    } else if (['.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
      // JavaScript: 根據檔案類型添加實作
      const filePath = fileSpec.path || '';
      const isServerFile = filePath.includes('server') || 
                          (filePath.includes('index') && !filePath.includes('public'));
      
      if (isServerFile) {
        // 伺服器檔案：生成完整的 Express 伺服器
        if (content.includes('require') && content.includes('express')) {
          // 如果已經有 express，擴充它
          if (!content.includes('app.get') || content.includes('// handle')) {
            content = content.replace(/app\.get\(['"]\/['"],\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*?\}\);/g, 
              `app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});`);
          }
          if (!content.includes('app.post') && !content.includes('/api/')) {
            content += `\n\n// API routes
app.post('/api/calculate', (req, res) => {
    try {
        const { expression } = req.body;
        const result = eval(expression);
        res.json({ result });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});`;
          }
          // 確保有 express.static
          if (!content.includes('express.static')) {
            content = content.replace(/app\.use\(express\.json\(\)\);/g, 
              `app.use(express.json());
app.use(express.static('public'));`);
          }
        }
      } else {
        // 前端 JavaScript：添加基本實作
        content = content.replace(/TODO: Implement/g, '// Implemented');
        content = content.replace(/TODO: /g, '// ');
        if (content.includes('class') && content.includes('constructor')) {
          content = content.replace(/constructor\(\)\s*\{[\s\S]*?\}/g, (match) => {
            if (match.includes('TODO') || match.length < 30) {
              return `constructor() {\n        // Initialize\n        console.log('${fileSpec.path} initialized');\n    }`;
            }
            return match;
          });
        }
      }
    } else if (['.css', '.scss'].includes(ext)) {
      // CSS: 添加基本樣式
      if (content.includes('TODO') || content.length < 100) {
        content = `/* ${fileSpec.description || 'Styles'} */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: Arial, sans-serif;
    line-height: 1.6;
    color: #333;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}`;
      }
    } else if (ext === '.json') {
      // JSON: 清理無效的註解並返回有效結構
      // 移除 JSON 中的註解（JSON 不支持註解）
      content = content.replace(/\/\*[\s\S]*?\*\//g, ''); // 移除 /* */ 註解
      content = content.replace(/\/\/.*$/gm, ''); // 移除 // 註解
      content = content.trim();
      
      // 檢查是否包含錯誤訊息（API 可能返回錯誤而不是 JSON）
      if (content.toLowerCase().includes('apologies') || 
          content.toLowerCase().includes('i\'m sorry') ||
          content.toLowerCase().includes('i cannot') ||
          content.toLowerCase().includes('unclear') ||
          content.toLowerCase().includes('confusion') ||
          content.toLowerCase().includes('not clear') ||
          content.toLowerCase().includes('please provide')) {
        logger.warn('JSON file contains error message, using default structure', null, {
          file: fileSpec.path,
          preview: content.substring(0, 200)
        });
        // 使用默認結構
        content = '';
      }
      
      // 如果內容無效或為空，生成有效的 JSON
      if (content.includes('TODO') || content === '{}' || content === '[]' || !content) {
        const fileName = (fileSpec.path || '').toLowerCase();
        if (fileName.includes('calculation') || fileName.includes('data')) {
          content = JSON.stringify({
            calculations: [],
            metadata: {
              generated: new Date().toISOString(),
              description: fileSpec.description || 'Calculation data'
            }
          }, null, 2);
        } else {
          content = JSON.stringify({
            data: [],
            metadata: {
              generated: new Date().toISOString(),
              description: fileSpec.description || 'Data file'
            }
          }, null, 2);
        }
      } else {
        // 嘗試解析現有 JSON，如果失敗則使用默認結構
        try {
          JSON.parse(content);
          // 如果解析成功，保持原樣
        } catch (e) {
          // 如果解析失敗，使用默認結構
          logger.warn('JSON parse failed, using default structure', null, {
            file: fileSpec.path,
            error: e.message
          });
          const fileName = (fileSpec.path || '').toLowerCase();
          if (fileName.includes('calculation') || fileName.includes('data')) {
            content = JSON.stringify({
              calculations: [],
              metadata: {
                generated: new Date().toISOString(),
                description: fileSpec.description || 'Calculation data'
              }
            }, null, 2);
          } else {
            content = JSON.stringify({
              data: [],
              metadata: {
                generated: new Date().toISOString(),
                description: fileSpec.description || 'Data file'
              }
            }, null, 2);
          }
        }
      }
    } else if (ext === '.py') {
      // Python: 添加基本實作
      content = content.replace(/# TODO: Implement/g, '# Implemented');
      content = content.replace(/# TODO: /g, '# ');
      if (content.includes('def ') && content.includes('pass')) {
        content = content.replace(/def (\w+)\([^)]*\):\s*pass/g, (match, funcName) => {
          return `def ${funcName}(self):\n        """${fileSpec.description || 'Method implementation'}"""\n        return None`;
        });
      }
    }
    
    // 移除所有剩餘的 TODO 註解（但保留 JSON 文件的完整性）
    if (ext !== '.json') {
      content = content.replace(/\/\/\s*TODO[^\n]*/gi, '');
      content = content.replace(/\/\*\s*TODO[^*]*\*\//gi, '');
      content = content.replace(/#\s*TODO[^\n]*/gi, '');
      
      // 只在非 JSON 文件末尾添加註解
      content = content + `\n\n// Generated with mock API for ${fileSpec.path}\n`;
    }
    // JSON 文件不添加註解，保持有效的 JSON 格式
    
    return {
      content: content,
      metadata: {
        tokens_used: Math.floor(Math.random() * 2000) + 500,
        model: 'mock-model-v1'
      }
    };
  }

  /**
   * 生成檔案細節（呼叫 worker agent）
   */
  async generateFileDetail(agent, fileSpec, context, requestId) {
    const agentName = this.getAgentName(agent);
    
    // If using mock API, use mock directly
    if (this.USE_MOCK_API) {
      logger.debug(`Using mock API for ${fileSpec.path}`, requestId);
      const apiPayload = {
        task: 'fill_details',
        context: context
      };
      const mockResult = await this.mockCloudAPI(apiPayload, requestId);
      
      // Return unified format
      return {
        success: true,
        content: mockResult.content,
        metadata: mockResult.metadata
      };
    }

    // 使用真實的 Worker Agent
    try {
      logger.debug(`Calling ${agentName} for ${fileSpec.path}`, requestId);
      
      // 準備請求 payload
      const payload = {
        skeleton: context.skeleton || '',
        fileSpec: context.fileSpec,
        context: {
          completedFiles: context.completedFiles || [],
          dependencies: context.dependencies || [],
          allFiles: context.allFiles || [], // 傳遞所有檔案資訊（預知未來）
          allSkeletons: context.allSkeletons || {}
        }
      };
      
      // 呼叫 worker agent
      const response = await fetch(agent.endpoint, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Request-ID': requestId
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Worker agent ${agentName} error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(`Worker agent ${agentName} returned failure: ${result.error || 'Unknown error'}`);
      }
      
      logger.debug(`✓ ${agentName} generated ${fileSpec.path}`, requestId, {
        tokens: result.metadata?.tokens_used,
        time_ms: result.metadata?.generation_time_ms,
        method: result.metadata?.method
      });
      
      return result;
      
    } catch (error) {
      // Worker agent failed, try Cloud API first, then fallback to mock
      logger.debug(`Worker agent ${agentName} unavailable, trying Cloud API for ${fileSpec.path}`, requestId, { 
        error: error.message 
      });
      
      // Try Cloud API if configured
      if (this.CLOUD_API_ENDPOINT && this.CLOUD_API_KEY) {
        try {
          logger.info(`Using Cloud API for detail generation (fallback from worker agent)`, requestId, {
            file: fileSpec.path
          });
          
          const apiPayload = {
            task: 'fill_details',
            instructions: `Generate complete implementation for ${fileSpec.path}. Include full functionality, error handling, and best practices.`,
            skeleton: context.skeleton || '',
            fileSpec: context.fileSpec,
            context: {
              completedFiles: context.completedFiles || [],
              dependencies: context.dependencies || [],
              allFiles: context.allFiles || [],
              allSkeletons: context.allSkeletons || {},
              contracts: context.contracts || null
            }
          };
          
          const cloudResponse = await this.generateDetailsViaCloudAPI(apiPayload, requestId);
          
          if (cloudResponse && cloudResponse.content) {
            logger.info(`✓ Cloud API generated ${fileSpec.path} (fallback)`, requestId, {
              size: cloudResponse.content.length
            });
            
            return {
              success: true,
              content: cloudResponse.content,
              metadata: cloudResponse.metadata || { 
                fallback: true, 
                method: 'cloud_api_fallback',
                original_error: error.message 
              }
            };
          }
        } catch (cloudError) {
          logger.warn(`Cloud API fallback failed for ${fileSpec.path}, using mock API`, requestId, {
            cloudError: cloudError.message
          });
        }
      }
      
      // Final fallback: mock API
      try {
        logger.debug(`Using mock API as final fallback for ${fileSpec.path}`, requestId);
        const apiPayload = {
          task: 'fill_details',
          context: context
        };
        const mockResult = await this.mockCloudAPI(apiPayload, requestId);
        
        return {
          success: true,
          content: mockResult.content,
          metadata: mockResult.metadata || { 
            fallback: true, 
            method: 'mock_api_fallback',
            original_error: error.message 
          }
        };
      } catch (fallbackError) {
        // Even mock API failed (shouldn't happen, but handle it)
        logger.error(`All generation methods failed for ${fileSpec.path}`, requestId, {
          workerError: error.message,
          mockError: fallbackError.message
        });
        
        // Return skeleton as final fallback
        return {
          success: true,
          content: context.skeleton || `// Error: Could not generate ${fileSpec.path}`,
          metadata: { 
            fallback: true, 
            error: `All generation methods failed: ${error.message}` 
          }
        };
      }
    }
  }

  /**
   * 生成前端檔案（每次都強制生成，通過 Worker Agents 根據使用者需求生成內容）
   * @param {Array} files - 現有檔案列表
   * @param {Object} coderInstructions - Coder instructions
   * @returns {Array} 生成的前端檔案列表（只有檔案規格，不包含 template）
   */
  generateFrontendFilesIfNeeded(files, coderInstructions) {
    const frontendFiles = [];
    
    // 獲取使用者需求摘要（用於生成描述）
    const userRequirement = coderInstructions.summary || 
                           coderInstructions.directives?.map(d => d.do).join(' ') || 
                           'web application';
    
    logger.info('Generating frontend files (always generate, will be processed by Worker Agents)', null, {
      userRequirement: userRequirement.substring(0, 100),
      existingFrontendFiles: files.filter(f => 
        f.path.startsWith('public/') || 
        f.path.includes('index.html') ||
        f.path.includes('style.css') ||
        f.path.includes('app.js') ||
        f.path.includes('script.js')
      ).map(f => f.path)
    });
    
    // 移除已存在的相同路徑檔案（強制重新生成）
    const existingPaths = new Set(files.map(f => f.path));
    const filesToRemove = ['public/index.html', 'public/style.css', 'public/index.js'];
    filesToRemove.forEach(path => {
      if (existingPaths.has(path)) {
        const index = files.findIndex(f => f.path === path);
        if (index !== -1) {
          files.splice(index, 1);
          logger.info(`Removed existing ${path} to force regeneration`, null);
        }
      }
    });
    
    // 生成 public/index.html（不包含 template，讓 Phase 1 和 Phase 2 生成）
    frontendFiles.push({
      path: 'public/index.html',
      language: 'html',
      type: 'html',
      description: `Main HTML page for ${userRequirement}. Generate a complete, semantic HTML structure that matches the user's requirements. Include proper meta tags, accessibility attributes, and structure that aligns with the application's purpose.`,
      purpose: 'Frontend entry point',
      requirements: [
        'Must be semantic HTML5',
        'Include proper meta tags for viewport and charset',
        'CRITICAL: Use <link rel="stylesheet" href="style.css"> (exact filename, relative path)',
        'CRITICAL: Use <script src="index.js"></script> (exact filename "index.js", NOT "app.js" or "main.js", relative path)',
        'Structure should match the user requirement',
        'Include accessibility attributes (aria-labels, roles if needed)',
        'For calculator: Include number buttons (0-9), operator buttons (+, -, *, /), equals button (=), clear button, and a display area'
      ]
    });
    
    // 生成 public/style.css（不包含 template，讓 Phase 1 和 Phase 2 生成）
    frontendFiles.push({
      path: 'public/style.css',
      language: 'css',
      type: 'css',
      description: `Main stylesheet for ${userRequirement}. Generate modern, responsive CSS that matches the application's design requirements. Use CSS Grid or Flexbox for layout, include mobile-first responsive design, and ensure styles align with the HTML structure.`,
      purpose: 'Application styles',
      requirements: [
        'Mobile-first responsive design',
        'Use CSS Grid or Flexbox for layout',
        'Match the HTML structure and classes',
        'Include modern CSS features (custom properties, transitions if needed)',
        'Ensure proper color scheme and typography'
      ]
    });
    
    // 生成 public/index.js（不包含 template，讓 Phase 1 和 Phase 2 生成）
    frontendFiles.push({
      path: 'public/index.js',
      language: 'javascript',
      type: 'javascript',
      description: `Main JavaScript file for ${userRequirement}. Generate complete, functional JavaScript code that implements the application's frontend logic. Include DOM manipulation, event handlers, and any required functionality based on the user's requirements.`,
      purpose: 'Frontend JavaScript logic',
      requirements: [
        'Use modern ES6+ syntax',
        'Include proper DOM manipulation',
        'Add event listeners for user interactions',
        'CRITICAL: Match selectors to the EXACT HTML structure (check completed HTML files)',
        'CRITICAL: Do NOT use selectors for elements that don\'t exist in the HTML',
        'For calculator: Handle button clicks, update display, perform calculations, handle clear',
        'Implement functionality based on user requirements',
        'Include error handling where appropriate',
        'Use async/await for any asynchronous operations',
        'Do NOT use import/export statements (use plain script tag)',
        'Do NOT use process.env (browser doesn\'t support it)'
      ]
    });
    
    logger.info('Frontend files added for generation', null, {
      files: frontendFiles.map(f => f.path),
      count: frontendFiles.length,
      note: 'These files will be processed through Phase 1 (skeleton) and Phase 2 (details) by Worker Agents'
    });
    
    return frontendFiles;
  }

  /**
   * 延遲函數
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = Coordinator;
