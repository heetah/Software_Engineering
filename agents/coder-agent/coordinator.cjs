/**
 * Coordinator - 協調骨架生成和細節填充的核心邏輯
 * 
 * 流程:
 * 1. Phase 1: 生成所有檔案的骨架（單次或分批 API 呼叫）
 * 2. Phase 2: 序列化生成每個檔案的細節（一次一個 agent，確保正確性）
 * 3. Phase 3: 組裝和驗證最終結果
 */

const logger = require('../shared/logger.cjs');
const path = require('path');
const DependencyAnalyzer = require('./dependency-analyzer');
const ConfigGenerator = require('./config-generator');
// const ContractsAgent = require('./contracts-agent'); // DISABLED - Architect provides complete contracts
const ContractsExtractor = require('./contracts-extractor');

// 載入 Worker Generators（本地調用，不需要 HTTP）
const MarkupGenerator = require('../worker-agents/markup-agent/generator');
const ScriptGenerator = require('../worker-agents/script-agent/generator');
const StyleGenerator = require('../worker-agents/style-agent/generator');
const PythonGenerator = require('../worker-agents/python-agent/generator');
const SystemGenerator = require('../worker-agents/system-agent/generator');

class Coordinator {
  constructor(config = {}) {
    // 依賴分析器
    this.dependencyAnalyzer = new DependencyAnalyzer();

    // 動態 Contracts 提取器
    this.contractsExtractor = new ContractsExtractor();

    // 動態 Contracts 提取器
    this.contractsExtractor = new ContractsExtractor();

    // 配置參數（先設定，再傳給 workers）
    this.MAX_FILES_PER_SKELETON_BATCH = config.maxSkeletonBatch || 30; // 擴大批次以支持大型專案
    this.DETAIL_GENERATION_DELAY = config.detailDelay || 1500; // 毫秒

    // API 配置優先順序：1. config 參數 (Frontend Keys) 2. CLOUD_API 3. OPENAI_API
    const provider = (config.llmProvider || "auto").toLowerCase();

    let apiKey = config.cloudApiKey;
    let endpoint = config.cloudApiEndpoint;

    // 根據 Provider 選擇 Key
    if (provider === 'gemini') {
      apiKey = config.geminiApiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
      endpoint = "https://generativelanguage.googleapis.com/v1beta";
    } else if (provider === 'openai') {
      apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
      endpoint = "https://api.openai.com/v1";
    } else if (provider === 'auto') {
      // Auto優先順序：傳入的 OpenAI -> 傳入的 Gemini -> 環境變數 OpenAI -> 環境變數 Gemini
      if (config.openaiApiKey) {
        apiKey = config.openaiApiKey;
        endpoint = "https://api.openai.com/v1";
      } else if (config.geminiApiKey) {
        apiKey = config.geminiApiKey;
        endpoint = "https://generativelanguage.googleapis.com/v1beta";
      } else if (process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY;
        endpoint = "https://api.openai.com/v1";
      } else if (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY) {
        apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
        endpoint = "https://generativelanguage.googleapis.com/v1beta";
      }
    }

    this.CLOUD_API_ENDPOINT = endpoint;
    this.CLOUD_API_KEY = apiKey;

    // 預設使用真實 API（不使用 mock）
    this.USE_MOCK_API = config.useMockApi === true;

    // 建立 worker config，確保傳遞 API 配置
    const workerConfig = {
      ...config,
      cloudApiEndpoint: this.CLOUD_API_ENDPOINT,
      cloudApiKey: this.CLOUD_API_KEY,
      useMockApi: this.USE_MOCK_API
    };

    // Worker generators 配置（本地調用）
    this.workers = {
      'markup': {
        generator: new MarkupGenerator(workerConfig),
        exts: ['.html', '.xml', '.md', '.htm', '.txt', '.gitignore', '.env', '.ps1', '.sh', '.bat', '.json']
      },
      'script': {
        generator: new ScriptGenerator(workerConfig),
        exts: ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']
      },
      'style': {
        generator: new StyleGenerator(workerConfig),
        exts: ['.css', '.scss', '.sass', '.less']
      },
      'python': {
        generator: new PythonGenerator(workerConfig),
        exts: ['.py']
      },
      'system': {
        generator: new SystemGenerator(workerConfig),
        exts: ['.c', '.cpp', '.h', '.hpp', '.go', '.rs', '.java', '.cs']
      }
    };

    logger.info('Coordinator initialized (local generators)', null, {
      use_mock_api: this.USE_MOCK_API,
      has_api_config: !!(this.CLOUD_API_ENDPOINT && this.CLOUD_API_KEY),
      worker_generators: Object.keys(this.workers).length,
      max_skeleton_batch: this.MAX_FILES_PER_SKELETON_BATCH
    });
  }

  /**
   * 主入口：從 architect payload 生成所有檔案
   */
  async generateFromArchitectPayload(payload, requestId = null) {
    logger.info('Coordinator starting - preprocessing payload', requestId);

    try {
      // Phase -1: Contracts Agent 預處理 payload (DISABLED - Architect Agent already provides complete contracts)
      // logger.info('Phase -1: Running Contracts Agent preprocessing', requestId);
      // const contractsAgent = new ContractsAgent();
      // const enhancedPayload = await contractsAgent.processPayload(payload);

      // 跳過 ContractsAgent，直接使用 Architect 的輸出
      const enhancedPayload = payload;
      logger.info('Phase -1: Skipped (using Architect contracts directly)', requestId);

      // 使用增強後的 payload 繼續
      const coderInstructions = enhancedPayload.output.coder_instructions;
      const files = coderInstructions.files;
      const contracts = coderInstructions.contracts || null;
      const projectConfig = coderInstructions.projectConfig || null;

      logger.info('Starting generation with enhanced payload', requestId, {
        totalFiles: files.length,
        hasContracts: !!contracts,
        hasProjectConfig: !!projectConfig,
        useMockApi: this.USE_MOCK_API
      });

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

      // Phase 1: 生成骨架（傳遞完整的 coder_instructions 包含 contracts）
      logger.info('Phase 1: Generating skeletons', requestId);
      const skeletons = await this.generateAllSkeletons(coderInstructions, requestId);

      // Phase 2: 序列化生成細節（傳遞 contracts 和 projectConfig）
      logger.info('Phase 2: Generating details sequentially', requestId);
      const detailedFiles = await this.generateDetailsSequentially(files, skeletons, contracts, projectConfig, requestId);

      // Phase 3: 組裝（傳遞 payload 以便生成 setup 檔案）
      logger.info('Phase 3: Assembling results', requestId);
      const result = await this.assemble(detailedFiles, skeletons, requestId, enhancedPayload.output);

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
   * @param {Object} coderInstructions - 包含 files, requirements, contracts
   */
  async generateAllSkeletons(coderInstructions, requestId) {
    const files = Array.isArray(coderInstructions) ? coderInstructions : coderInstructions.files;
    logger.info('Generating skeletons with auto-batching', requestId, {
      totalFiles: files.length
    });

    // 直接呼叫 generateSkeletonsBatch，它會自動決定是否分批
    // 傳遞完整的 coderInstructions（包含 contracts）
    return await this.generateSkeletonsBatch(coderInstructions, requestId);
  }

  /**
   * 單次或分批生成骨架（自動檢測是否需要分批）
   * @param {Object|Array} coderInstructions - 可以是 {files, contracts} 或純 files[]
   */
  async generateSkeletonsBatch(coderInstructions, requestId) {
    // 每批最多多少檔案（可由建構子 / 環境變數調整）
    const MAX_FILES_PER_BATCH = this.MAX_FILES_PER_SKELETON_BATCH || 5;

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

      // 批次間延遲（避免 API rate limit），快速模式可為 0
      if (i < batches.length - 1 && this.SKELETON_BATCH_DELAY > 0) {
        logger.info(
          `Waiting ${this.SKELETON_BATCH_DELAY}ms before next batch...`,
          requestId
        );
        await this.sleep(this.SKELETON_BATCH_DELAY);
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

      // 檢查是否有檔案缺少骨架
      const missing = files.filter(f => !skeletonMap[f.path]);
      if (missing.length > 0) {
        logger.warn('Some files missing skeletons', requestId, {
          missingFiles: missing.map(f => f.path),
          receivedSkeletons: Object.keys(skeletonMap)
        });
      }
    } else {
      logger.warn('Invalid skeleton response format', requestId, { response });
      throw new Error('Cloud API returned invalid skeleton format');
    }

    logger.info('Skeletons generated successfully', requestId, {
      count: Object.keys(skeletonMap).length,
      files: Object.keys(skeletonMap)
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
   * @param {Object} projectConfig - 項目配置（端口、API等）
   */
  async generateDetailsSequentially(files, skeletons, contracts, projectConfig, requestId) {
    // 分析檔案依賴關係
    const { order, groups, depGraph } = this.dependencyAnalyzer.analyze(files, skeletons, requestId);

    // 視覺化依賴關係（用於除錯）
    this.dependencyAnalyzer.visualizeDependencies(depGraph, groups, requestId);

    // 🔄 動態 Contracts：會隨著每層生成完畢而更新
    let dynamicContracts = contracts ? { ...contracts } : { dom: [], api: [], storage: [] };

    logger.info('Starting layered detail generation', requestId, {
      totalFiles: files.length,
      layers: groups.length,
      strategy: groups.length === 1 ? 'all-concurrent' : 'layered-concurrent',
      hasContracts: !!contracts,
      dynamicContractsEnabled: true
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

          // Speed Optimization: Determine Model Tier (Adaptive Selection)
          // Simple files use 'fast' tier (Quantized/Mobile models)
          const ext = path.extname(file.path).toLowerCase();
          const fastExtensions = ['.css', '.scss', '.sass', '.less', '.html', '.htm', '.json', '.xml', '.md', '.txt', '.env', '.gitignore'];
          const isSimpleFile = fastExtensions.includes(ext);
          const modelTier = isSimpleFile ? 'fast' : 'strong';

          if (isSimpleFile) {
            logger.info(`⚡ assigning FAST tier for ${path.basename(file.path)}`, requestId);
          }

          const context = {
            skeleton: fileSkeleton,
            allSkeletons: skeletons,
            completedFiles: results
              .filter(r => !r.error)
              .map(r => ({ path: r.path, content: r.content, language: r.language })),
            dependencies: completedDeps,
            allFiles: files, // 傳遞所有檔案資訊（用於預知將來的檔案）
            contracts: dynamicContracts, // ← 🔄 使用動態更新的 contracts
            projectConfig: projectConfig || null, // ← 新增：傳遞項目配置給 Worker Agents
            modelTier: modelTier, // ← Add modelTier to context
            fileSpec: {
              path: file.path,
              language: file.language,
              description: file.description || '',
              requirements: file.requirements || [],
              template: file.template || null // ← 🔥 CRITICAL: 傳遞 template 給 Worker Agents
            }
          };

          // 呼叫 worker agent
          const result = await this.generateFileDetail(agent, file, context, requestId);

          if (!result.content || result.content.trim() === '') {
            logger.warn(`⚠ Worker agent returned empty content for ${file.path}`, requestId);
          }

          logger.info(`✅ Generated ${path.basename(file.path)}`, requestId, {
            layer: layerIdx + 1,
            agent: agentName,
            tokens: result.metadata?.tokens_used,
            size: result.content?.length || 0,
            hasContent: !!(result.content && result.content.trim())
          });

          return {
            path: file.path,
            content: result.content,
            language: file.language,
            metadata: result.metadata || {},
            layer: layerIdx + 1
          };

        } catch (error) {
          logger.error(`❌ Failed to generate ${path.basename(file.path)}`, requestId, {
            layer: layerIdx + 1,
            error: error.message
          });

          // 失敗時使用骨架作為 fallback
          return {
            path: file.path,
            content: skeletons[file.path] || `// Error generating ${file.path}: ${error.message}`,
            language: file.language,
            error: error.message,
            layer: layerIdx + 1
          };
        }
      });

      // 等待當前層的所有檔案生成完成
      const layerResults = await Promise.all(layerPromises);
      results.push(...layerResults);

      // 🔄 動態更新 Contracts：從本層生成的檔案中提取實際的 DOM IDs, IPC channels 等
      if (!isLastLayer) {
        const successfulLayerResults = layerResults.filter(r => !r.error && r.content);
        if (successfulLayerResults.length > 0) {
          const extracted = this.contractsExtractor.extractFromFiles(successfulLayerResults, requestId);
          dynamicContracts = this.contractsExtractor.mergeContracts(dynamicContracts, extracted, requestId);

          logger.info(`Dynamic contracts updated after Layer ${layerIdx + 1}`, requestId, {
            domElements: dynamicContracts.dom.length,
            apiEndpoints: dynamicContracts.api.length,
            storageKeys: dynamicContracts.storage.length,
            newlyExtracted: {
              dom: extracted.dom.length,
              api: extracted.api.length,
              storage: extracted.storage.length
            }
          });
        }
      }

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
      successRate: `${(successful / files.length * 100).toFixed(1)}%`
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
    const basename = path.basename(filePath).toLowerCase();

    // 特殊檔案名稱處理（沒有副檔名的檔案）
    if (basename === '.gitignore' || basename === '.env.example' || basename === 'dockerfile') {
      return this.workers.markup;
    }

    // requirements.txt 特別處理 → 使用 python-agent
    if (basename === 'requirements.txt') {
      return this.workers.python;
    }

    // 根據副檔名匹配
    for (const [name, worker] of Object.entries(this.workers)) {
      if (worker.exts.includes(ext)) {
        return worker;
      }
    }

    // 預設使用 markup agent（改為文字處理）
    return this.workers.markup;
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
        logger.warn('Skeleton API call failed, falling back to mock', requestId, { error: error.message });
        return this.mockCloudAPI(payload, requestId);
      }
    }

    // Phase 2 細節生成：根據配置決定使用 mock 還是 Worker Agents
    if (this.USE_MOCK_API) {
      return this.mockCloudAPI(payload, requestId);
    }

    // 真實 API 呼叫（目前不會到達這裡，因為 Phase 2 用 Worker Agents）
    try {
      const apiUrl = this._getChatCompletionUrl(this.CLOUD_API_ENDPOINT);

      logger.info('Calling Cloud API', requestId, {
        url: apiUrl,
        model: 'gpt-5.1-codex-max' // Default assumption, adapter may override
      });

      const response = await this.fetchWithRetry(apiUrl, {
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
   * Helper: Normalize and construct the Chat Completion URL
   * This handles various formats of OPENAI_BASE_URL to avoid 404s
   */
  _getChatCompletionUrl(baseUrl) {
    if (!baseUrl) return 'https://api.openai.com/v1/chat/completions';

    let url = baseUrl.trim();
    // Remove trailing slash
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    // Case 1: Base URL already includes the full endpoint (e.g. from some proxies)
    if (url.endsWith('/chat/completions')) {
      return url;
    }

    // Case 2: Base URL ends with /v1
    if (url.endsWith('/v1')) {
      return `${url}/chat/completions`;
    }

    // Case 3: Just the domain or base path (e.g. https://api.openai.com)
    return `${url}/v1/chat/completions`;
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

    let userPrompt = `Generate skeletons for these files:

Project Requirements:
${payload.requirements || 'No specific requirements'}

Files to generate:
${payload.files.map((f, i) => `${i + 1}. ${f.path} (${f.type}): ${f.description}`).join('\n')}
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

    userPrompt += `
Generate structural skeletons following language conventions:
- HTML: DOCTYPE, head, body structure, script/link tags with correct file paths
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

    try {
      // 檢測 API 類型（Gemini 或 OpenAI）
      const isGemini = this.CLOUD_API_ENDPOINT.includes('generativelanguage.googleapis.com');

      let requestBody, headers;

      if (isGemini) {
        // Gemini API 格式
        requestBody = {
          contents: [{
            parts: [{
              text: `${systemPrompt}\n\n${userPrompt}`
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 64000  // Gemini 2.5 Flash 支援最高 65536 tokens 輸出
          }
        };

        headers = {
          'Content-Type': 'application/json'
        };

        // Gemini 使用 query parameter 認證
        let baseUrl = this.CLOUD_API_ENDPOINT;
        if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

        const model = 'gemini-2.5-pro'; // Coder Agent skeleton 生成使用
        const apiUrl = `${baseUrl}/models/${model}:generateContent?key=${this.CLOUD_API_KEY}`;

        const response = await this.fetchWithRetry(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        }, requestId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        const generatedText = result.candidates[0].content.parts[0].text;

        logger.info('Raw API response received', requestId, {
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
            fullText: cleanedText.substring(0, 2000)  // 增加顯示長度
          });
          throw new Error('API response does not contain valid JSON array');
        }

        let skeletons;
        try {
          skeletons = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
          logger.error('JSON parse failed', requestId, {
            error: parseError.message,
            jsonPreview: jsonMatch[0].substring(0, 1000),  // 增加預覽長度
            jsonLength: jsonMatch[0].length
          });

          // 嘗試修復常見的轉義問題
          try {
            // 移除多餘的反斜線轉義
            let fixedJson = jsonMatch[0]
              .replace(/\\\\\\\\/g, '\\')  // 4個反斜線 → 1個
              .replace(/\\\\\"/g, '"')     // 2個反斜線+引號 → 引號
              .replace(/\\\\n/g, '\\n');   // 2個反斜線+n → \n

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
          fileCount: skeletons.length,
          tokensUsed: result.usageMetadata?.totalTokenCount || 0
        });

        return { skeletons };

      } else {
        // OpenAI API 格式
        // gpt-5.1-codex-max 使用 v1/responses endpoint
        const apiUrl = `${this.CLOUD_API_ENDPOINT}/responses`;

        // Responses API 使用 input (字符串) 而非 inputs (數組)
        // 需要將 system 和 user prompts 合併為單一字符串
        const combinedPrompt = `${systemPrompt}\n\nUser Request:\n${userPrompt}`;

        requestBody = {
          model: 'gpt-5.1-codex-max',
          input: combinedPrompt,
          temperature: 1
          // 注意：Responses API 不支持 max_tokens 參數
        };

        headers = {
          'Authorization': `Bearer ${this.CLOUD_API_KEY}`,
          'Content-Type': 'application/json'
        };

        logger.info('Calling OpenAI Responses API', requestId, {
          url: apiUrl,
          model: 'gpt-5.1-codex-max'
        });

        const response = await this.fetchWithRetry(apiUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestBody)
        }, requestId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        // Responses API 響應格式
        let generatedText = '';

        // 實際內容在 output 字段中
        if (data.output && Array.isArray(data.output) && data.output.length > 0) {
          // output 是一個數組，過濾出 message 類型的內容
          const messageBlocks = data.output.filter(block => {
            if (typeof block === 'string') return true;
            if (typeof block === 'object' && block.type === 'message') return true;
            return false;
          });


          generatedText = messageBlocks
            .map(block => {
              if (typeof block === 'string') return block;
              if (typeof block === 'object') {
                // message 對象的 content 可能是字符串、數組或對象
                let content = block.content;

                // 如果 content 是數組，提取所有 text 字段
                if (Array.isArray(content)) {
                  return content
                    .map(item => {
                      if (typeof item === 'string') return item;
                      if (typeof item === 'object') {
                        return item.text || item.content || '';
                      }
                      return '';
                    })
                    .join('');
                }

                // 如果 content 是對象，提取 text 字段
                if (typeof content === 'object' && content !== null) {
                  return content.text || content.content || '';
                }

                // 如果 content 是字符串
                if (typeof content === 'string') {
                  return content;
                }

                // 備用：嘗試 text 字段
                return block.text || '';
              }
              return '';
            })
            .filter(text => text.length > 0)
            .join('');
        } else if (data.output && typeof data.output === 'object') {
          // output 是單個對象
          if (data.output.text) {
            generatedText = data.output.text;
          } else if (data.output.content) {
            generatedText = data.output.content;
          } else {
            // 嘗試序列化整個對象
            generatedText = JSON.stringify(data.output);
          }
        } else if (data.output && typeof data.output === 'string') {
          generatedText = data.output;
        } else if (data.text && Array.isArray(data.text) && data.text.length > 0) {
          // 備用：如果 text 是數組
          generatedText = data.text
            .map(block => {
              if (typeof block === 'string') return block;
              return block.text || block.content || '';
            })
            .join('');
        } else if (data.text && typeof data.text === 'string') {
          generatedText = data.text;
        } else if (typeof data.output_text === 'string') {
          generatedText = data.output_text;
        } else if (data.choices && data.choices[0] && data.choices[0].message) {
          // Fallback to Chat Completions format
          generatedText = data.choices[0].message.content || '';
        } else {
          // 記錄詳細錯誤信息
          logger.error('Cannot extract text from response', requestId, {
            keys: Object.keys(data),
            hasOutput: 'output' in data,
            outputType: typeof data.output,
            outputIsArray: Array.isArray(data.output),
            hasText: 'text' in data,
            textType: typeof data.text,
            fullResponse: JSON.stringify(data).substring(0, 500)
          });
          throw new Error('Cannot extract text content from API response');
        }

        // 確保生成的文本不是 [object Object]
        if (generatedText === '[object Object]' || generatedText.includes('[object Object]')) {
          logger.error('Generated text contains [object Object]', requestId, {
            generatedText: generatedText.substring(0, 200),
            dataOutput: data.output ? JSON.stringify(data.output).substring(0, 200) : 'N/A'
          });
          throw new Error('Failed to properly extract text from response');
        }

        // 確保是字符串
        if (typeof generatedText !== 'string') {
          throw new Error(`Response is not a string: ${typeof generatedText}`);
        }

        // 解析 JSON
        const jsonMatch = generatedText.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          throw new Error('API response does not contain valid JSON array');
        }

        const skeletons = JSON.parse(jsonMatch[0]);

        logger.info('Skeleton generation via API completed', requestId, {
          fileCount: skeletons.length,
          tokensUsed: data.usage?.total_tokens || 0
        });

        return { skeletons };
      }

    } catch (error) {
      logger.error('Failed to generate skeletons via API', requestId, {
        error: error.message
      });
      throw error;
    }
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
      // 生成細節的 mock 回應
      const content = this.generateMockDetailedContent(payload.context);
      return Promise.resolve({
        content: content,
        metadata: {
          tokens_used: Math.floor(Math.random() * 3000) + 1000,
          model: 'mock-model-v1'
        }
      });
    }

    return Promise.reject(new Error(`Unknown mock task: ${payload.task}`));
  }

  /**
   * 生成 mock 骨架
   */
  generateMockSkeleton(file) {
    const ext = path.extname(file.path).toLowerCase();

    switch (ext) {
      case '.html':
      case '.htm':
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${file.description || 'Page'}</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <!-- TODO: Implement ${file.description || 'content'} -->
</body>
</html>`;

      case '.css':
      case '.scss':
        return `/* ${file.description || 'Styles'} */

/* TODO: Implement styles */
body {
    margin: 0;
    padding: 0;
}`;

      case '.js':
      case '.jsx':
        return `// ${file.description || 'JavaScript Module'}

// TODO: Implement functionality
export class App {
    constructor() {
        // TODO: Initialize
    }
    
    init() {
        // TODO: Setup
    }
}`;

      case '.py':
        return `"""
${file.description || 'Python Module'}
"""

# TODO: Implement functionality

class App:
    """Main application class"""
    
    def __init__(self):
        """Initialize the application"""
        pass
    
    def run(self):
        """Run the application"""
        pass`;

      default:
        return `// ${file.description || 'Module'}\n\n// TODO: Implement ${file.path}`;
    }
  }

  /**
   * 生成 mock 詳細內容（簡單擴充骨架）
   */
  generateMockDetailedContent(context) {
    if (!context || !context.skeleton) {
      return '// Error: No skeleton provided';
    }

    // 簡單地在骨架後面添加一些實作
    const skeleton = context.skeleton;
    const fileSpec = context.fileSpec || {};

    return skeleton.replace(/TODO: Implement/g, 'IMPLEMENTED (mock)')
      .replace(/TODO: /g, '')
      + `\n\n// Generated with mock API for ${fileSpec.path}\n`;
  }

  /**
   * 生成檔案細節（呼叫 worker agent）
   */
  async generateFileDetail(agent, fileSpec, context, requestId) {
    const agentName = this.getAgentName(agent);

    try {
      logger.debug(`Calling ${agentName} generator for ${fileSpec.path}`, requestId);

      // 準備請求參數
      const params = {
        skeleton: context.skeleton || '',
        fileSpec: context.fileSpec,
        context: {
          completedFiles: context.completedFiles || [],
          dependencies: context.dependencies || [],
          allFiles: context.allFiles || [],
          allSkeletons: context.allSkeletons || {},
          contracts: context.contracts || null,
          projectConfig: context.projectConfig || null
        }
      };

      // 直接調用本地 generator
      const result = await agent.generator.generate(params);

      if (!result || !result.content) {
        throw new Error(`Generator returned invalid result`);
      }

      logger.debug(`✓ ${agentName} generated ${fileSpec.path}`, requestId, {
        tokens: result.tokensUsed,
        method: result.method,
        size: result.content.length
      });

      // 統一返回格式
      return {
        success: true,
        content: result.content,
        metadata: {
          tokens_used: result.tokensUsed,
          method: result.method,
          agent: agentName
        }
      };

    } catch (error) {
      logger.error(`Worker generator ${agentName} error`, requestId, {
        error: error.message,
        file: fileSpec.path
      });

      // Fallback 到骨架
      return {
        success: false,
        content: context.skeleton || `// Error generating ${fileSpec.path}: ${error.message}`,
        metadata: {
          error: error.message,
          fallback: 'skeleton'
        }
      };
    }
  }

  /**
   * 延遲函數
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Fetch with retry logic for 502/503/504 errors
   */
  async fetchWithRetry(url, options, requestId, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries + 1; i++) {
      try {
        const response = await fetch(url, options);

        // If successful or client error (4xx), return immediately
        if (response.ok || response.status < 500) {
          return response;
        }

        // If server error (5xx) and we have retries left
        if (i < retries) {
          const delay = backoff * Math.pow(2, i); // Exponential backoff
          logger.warn(`API request failed with ${response.status}, retrying in ${delay}ms...`, requestId, {
            attempt: i + 1,
            maxRetries: retries
          });
          await this.sleep(delay);
          continue;
        }

        return response;

      } catch (error) {
        // Network errors (e.g. DNS, connection refused)
        if (i < retries) {
          const delay = backoff * Math.pow(2, i);
          logger.warn(`API request network error: ${error.message}, retrying in ${delay}ms...`, requestId, {
            attempt: i + 1,
            maxRetries: retries
          });
          await this.sleep(delay);
        } else {
          throw error;
        }
      }
    }
  }
}

module.exports = Coordinator;
