/**
 * Markup Generator
 * 主要依賴雲端 API 生成 HTML，fallback 到簡單模擬
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class MarkupGenerator {
  constructor(config = {}) {
    this.cloudApiEndpoint = config.cloudApiEndpoint || process.env.CLOUD_API_ENDPOINT;
    this.cloudApiKey = config.cloudApiKey || process.env.CLOUD_API_KEY;
    this.useMockApi = !this.cloudApiEndpoint;
  }

  async generate({ skeleton, fileSpec, context }) {
    console.log(`[Generator] Processing ${fileSpec.path}`);
    console.log(`[Generator] Mode: ${this.useMockApi ? 'MOCK (Fallback)' : 'CLOUD API'}`);
    
    if (this.useMockApi) {
      return this.generateWithMock({ skeleton, fileSpec, context });
    } else {
      return this.generateWithCloudAPI({ skeleton, fileSpec, context });
    }
  }

  /**
   * 雲端 API 生成
   */
  async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });
    
    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: 'You are an expert HTML developer. Generate clean, semantic HTML based on requirements. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
      });
      
      // 檢查 API 是否真的返回了內容
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }
      
      let cleanContent = content
        .replace(/^```html\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .trim();
      
      // 二次檢查清理後的內容
      if (!cleanContent) {
        console.warn('[Generator] Content became empty after cleaning. Original content length:', content.length);
        console.warn('[Generator] Original content preview:', content.substring(0, 200));
        throw new Error('Content became empty after markdown removal');
      }
      
      // 驗證並修正檔案路徑引用（必須在返回前執行）
      cleanContent = this.fixFileReferences(cleanContent, fileSpec, context);
      
      // 二次驗證：確保沒有錯誤的引用
      const jsFiles = (context.allFiles || []).filter(f => f.path.endsWith('.js') || f.path.endsWith('.mjs') || f.path.endsWith('.cjs'));
      jsFiles.forEach(jsFile => {
        if (jsFile.path === 'public/index.js') {
          const correctPath = path.relative(path.dirname(fileSpec.path), jsFile.path).replace(/\\/g, '/');
          // 強制替換所有可能的錯誤引用
          cleanContent = cleanContent.replace(/src=['"]\.\/app\.js['"]/gi, `src="${correctPath}"`);
          cleanContent = cleanContent.replace(/src=['"]app\.js['"]/gi, `src="${correctPath}"`);
          cleanContent = cleanContent.replace(/src=['"]\.\/main\.js['"]/gi, `src="${correctPath}"`);
          cleanContent = cleanContent.replace(/src=['"]main\.js['"]/gi, `src="${correctPath}"`);
        }
      });
      
      return {
        content: cleanContent,
        tokensUsed,
        method: 'cloud-api'
      };
      
    } catch (error) {
      console.error('[Generator] API error:', error.message);
      console.log('[Generator] Falling back to mock...');
      return this.generateWithMock({ skeleton, fileSpec, context });
    }
  }

  /**
   * Mock fallback（僅用於除錯/測試）
   */
  async generateWithMock({ skeleton, fileSpec, context }) {
    const { description } = fileSpec;
    
    const content = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${description || 'Page'}</title>
</head>
<body>
    <h1>${description || 'Content'}</h1>
    <p>Mock fallback - Configure CLOUD_API_ENDPOINT for real generation</p>
</body>
</html>`;
    
    return {
      content,
      tokensUsed: Math.ceil(content.length / 4),
      method: 'mock-fallback'
    };
  }

  buildPrompt({ skeleton, fileSpec, context }) {
    const { path: filePath, description, requirements = [] } = fileSpec;
    const completedFiles = context.completedFiles || [];
    const allFiles = context.allFiles || [];
    const contracts = context.contracts || null;
    
    let prompt = `Generate HTML for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：如果有 contracts，顯示相關資訊
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // ✨ DOM contracts - 最重要！定義必須存在的 HTML 元素
      if (contracts.dom && contracts.dom.length > 0) {
        const relevantDom = contracts.dom.filter(dom => 
          dom.producers.includes(filePath)
        );
        
        if (relevantDom.length > 0) {
          prompt += `\n⚠️ CRITICAL: DOM STRUCTURE REQUIREMENTS ⚠️\n`;
          prompt += `The following elements are MANDATORY and will be queried by JavaScript:\n`;
          prompt += `Missing ANY of these will cause JavaScript errors!\n\n`;
          
          relevantDom.forEach((dom, idx) => {
            prompt += `DOM Contract #${idx + 1}: ${dom.description}\n`;
            
            if (dom.templateId) {
              prompt += `  Template ID: #${dom.templateId}\n`;
            }
            if (dom.containerId) {
              prompt += `  Container ID: #${dom.containerId}\n`;
            }
            
            prompt += `  Required Elements:\n`;
            dom.requiredElements.forEach(elem => {
              prompt += `    • ${elem.selector} <${elem.element}>\n`;
              prompt += `      Purpose: ${elem.purpose}\n`;
              if (elem.attributes) {
                prompt += `      Attributes: ${JSON.stringify(elem.attributes)}\n`;
              }
              prompt += `      Used by: ${elem.consumers.join(', ')}\n`;
            });
            prompt += `\n`;
          });
          
          prompt += `YOU MUST:\n`;
          prompt += `1. Include ALL elements listed above with EXACT selectors\n`;
          prompt += `2. Use the specified HTML element types\n`;
          prompt += `3. Add all required attributes\n`;
          prompt += `4. Place elements in logical positions within the HTML structure\n`;
          prompt += `5. If templateId is specified, create a <template> element with that ID\n\n`;
        }
      }
      
      // API contracts - 提示前端需要呼叫哪些 endpoints
      if (contracts.api && contracts.api.length > 0) {
        const relevantApis = contracts.api.filter(api => 
          api.consumers.some(c => c.includes(filePath.replace('.html', '.js')))
        );
        
        if (relevantApis.length > 0) {
          prompt += `API Endpoints (for JavaScript to call):\n`;
          relevantApis.forEach(api => {
            prompt += `  ${api.endpoint} - ${api.description}\n`;
          });
          prompt += `Note: Ensure HTML forms/buttons match the data structure needed by these APIs.\n\n`;
        }
      }
      
      // Events contracts - HTML 需要觸發的事件
      if (contracts.events && contracts.events.length > 0) {
        const relevantEvents = contracts.events.filter(evt =>
          evt.emitters.some(e => e.includes(filePath.replace('.html', '.js')))
        );
        
        if (relevantEvents.length > 0) {
          prompt += `Custom Events:\n`;
          relevantEvents.forEach(evt => {
            prompt += `  ${evt.name} - ${evt.description}\n`;
          });
          prompt += `\n`;
        }
      }
      
      // Storage contracts - 提示需要哪些 data-* attributes
      if (contracts.storage && contracts.storage.length > 0) {
        prompt += `Storage Keys (use data-* attributes if needed):\n`;
        contracts.storage.forEach(store => {
          prompt += `  ${store.key} - ${store.description}\n`;
        });
        prompt += `\n`;
      }
      
      prompt += `=== END CONTRACTS ===\n\n`;
    }
    
    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`html\n${skeleton}\n\`\`\`\n\n`;
    }
    
    if (allFiles.length > 0) {
      const cssFiles = allFiles.filter(f => f.path.endsWith('.css'));
      const jsFiles = allFiles.filter(f => f.path.endsWith('.js'));
      
      // 計算相對路徑（從 HTML 檔案位置到 CSS/JS 檔案）
      const htmlDir = path.dirname(filePath);
      
      if (cssFiles.length > 0) {
        prompt += `CSS files available:\n`;
        cssFiles.forEach(cssFile => {
          // 計算相對路徑
          const relativePath = path.relative(htmlDir, cssFile.path).replace(/\\/g, '/');
          prompt += `  - ${cssFile.path} (use relative path: "${relativePath}")\n`;
        });
      }
      if (jsFiles.length > 0) {
        prompt += `JS files available:\n`;
        jsFiles.forEach(jsFile => {
          // 計算相對路徑
          const relativePath = path.relative(htmlDir, jsFile.path).replace(/\\/g, '/');
          prompt += `  - ${jsFile.path} (use relative path: "${relativePath}")\n`;
        });
      }
      prompt += `\nCRITICAL: Use the relative paths shown above in <link> and <script> tags.\n`;
      prompt += `For example, if HTML is at "public/index.html" and CSS is at "public/style.css", use href="style.css" (not "public/style.css" or "styles/main.css").\n`;
      prompt += `CRITICAL: If JS file is "public/index.js", use src="index.js" (NOT "app.js" or "main.js" or "scripts/main.js").\n`;
      prompt += `CRITICAL: Match the EXACT filename from the relative path above.\n\n`;
    }
    
    // 優先使用 context 中的完整用戶需求，而不是僅依賴文件描述
    const userRequirement = context.userRequirement || context.projectSummary || fileSpec.description || '';
    const projectRequirements = context.projectRequirements || [];
    const isCalculator = userRequirement.toLowerCase().includes('calculator') || 
                        userRequirement.toLowerCase().includes('計算') ||
                        userRequirement.toLowerCase().includes('計算機') ||
                        fileSpec.description?.toLowerCase().includes('calculator') ||
                        fileSpec.description?.toLowerCase().includes('計算');
    
    // 在 prompt 開頭添加用戶需求
    if (userRequirement && userRequirement !== fileSpec.description) {
      prompt = `=== USER REQUIREMENT ===\n${userRequirement}\n\n${projectRequirements.length > 0 ? `=== PROJECT REQUIREMENTS ===\n${projectRequirements.join('\n')}\n\n` : ''}${prompt}`;
    }
    
    prompt += `Generate complete, production-ready HTML with:\n`;
    prompt += `- Semantic HTML5 structure\n`;
    prompt += `- Proper accessibility attributes (aria-*, alt, labels)\n`;
    prompt += `- data-* attributes for all interactive elements that need JS handling\n`;
    prompt += `- CRITICAL: All IDs, classes, data-* attributes, and element text MUST match skeleton exactly\n`;
    prompt += `- CRITICAL: Any symbols or values in buttons/inputs that JS will read must be consistent\n`;
    prompt += `- CRITICAL: Use EXACT relative paths shown above for <link> and <script> tags\n`;
    prompt += `- CRITICAL: Do NOT invent paths like "styles/main.css" or "scripts/main.js" - use the actual relative paths provided above\n`;
    prompt += `- The HTML file is at: ${filePath}\n`;
    prompt += `- Use relative paths from the HTML file's directory to the CSS/JS files\n`;
    if (isCalculator) {
      prompt += `\nCALCULATOR-SPECIFIC REQUIREMENTS:\n`;
      prompt += `- Create a well-structured calculator layout:\n`;
      prompt += `  * Display area at the top (use <div> or <input> with id="display")\n`;
      prompt += `  * Buttons container with class="buttons" using CSS Grid\n`;
      prompt += `  * Number buttons (0-9) with values matching their text\n`;
      prompt += `  * Operator buttons (+, -, *, /) with distinct styling classes\n`;
      prompt += `  * Equals button (=) and clear button (C)\n`;
      prompt += `  * Use semantic structure for better accessibility\n`;
    }
    prompt += `\nReturn ONLY the code, no markdown.`;
    
    return prompt;
  }

  /**
   * 修正 HTML 中的檔案引用路徑
   * 確保使用正確的相對路徑和檔案名稱
   */
  fixFileReferences(htmlContent, fileSpec, context) {
    const htmlDir = path.dirname(fileSpec.path);
    const allFiles = context.allFiles || [];
    
    // 找出 CSS 和 JS 檔案
    const cssFiles = allFiles.filter(f => f.path.endsWith('.css'));
    const jsFiles = allFiles.filter(f => f.path.endsWith('.js') || f.path.endsWith('.mjs') || f.path.endsWith('.cjs'));
    
    // 修正 CSS 引用
    cssFiles.forEach(cssFile => {
      const correctPath = path.relative(htmlDir, cssFile.path).replace(/\\/g, '/');
      const fileName = path.basename(cssFile.path);
      
      // 替換錯誤的路徑模式
      const patterns = [
        /href=["']styles\/[^"']+\.css["']/gi,
        /href=["']css\/[^"']+\.css["']/gi,
        /href=["']\.\/styles\/[^"']+\.css["']/gi,
        /href=["']public\/[^"']+\.css["']/gi
      ];
      
      patterns.forEach(pattern => {
        htmlContent = htmlContent.replace(pattern, `href="${correctPath}"`);
      });
      
      // 確保使用正確的檔案名稱
      if (cssFile.path === 'public/style.css' && !htmlContent.includes(`href="${correctPath}"`)) {
        // 如果沒有找到正確的引用，添加或替換
        if (htmlContent.includes('<link')) {
          htmlContent = htmlContent.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, 
            `<link rel="stylesheet" href="${correctPath}">`);
        } else if (htmlContent.includes('</head>')) {
          htmlContent = htmlContent.replace('</head>', `  <link rel="stylesheet" href="${correctPath}">\n</head>`);
        }
      }
    });
    
      // 修正 JS 引用
      jsFiles.forEach(jsFile => {
        const correctPath = path.relative(htmlDir, jsFile.path).replace(/\\/g, '/');
        const fileName = path.basename(jsFile.path);
        
        // 替換錯誤的路徑模式（更全面的模式匹配）
        const patterns = [
          /src=["']scripts\/[^"']+\.js["']/gi,
          /src=["']js\/[^"']+\.js["']/gi,
          /src=["']\.\/scripts\/[^"']+\.js["']/gi,
          /src=["']public\/[^"']+\.js["']/gi,
          /src=["']app\.js["']/gi,  // 特別處理 app.js → index.js
          /src=["']main\.js["']/gi,  // 特別處理 main.js → index.js
          /src=["'][^"']*app\.js["']/gi,  // 任何包含 app.js 的路徑
          /src=["'][^"']*main\.js["']/gi  // 任何包含 main.js 的路徑
        ];
        
        patterns.forEach(pattern => {
          if (jsFile.path === 'public/index.js') {
            htmlContent = htmlContent.replace(pattern, `src="${correctPath}"`);
          } else {
            htmlContent = htmlContent.replace(pattern, `src="${correctPath}"`);
          }
        });
        
        // 強制修正：如果 HTML 中有任何 script 標籤但路徑不對，全部替換
        if (jsFile.path === 'public/index.js') {
          // 先替換所有可能的錯誤引用模式
          const errorPatterns = [
            /src=['"]\.\/app\.js['"]/gi,
            /src=['"]app\.js['"]/gi,
            /src=['"]\.\/main\.js['"]/gi,
            /src=['"]main\.js['"]/gi,
            /src=['"]scripts\/[^"']+\.js['"]/gi,
            /src=['"]js\/[^"']+\.js['"]/gi
          ];
          
          errorPatterns.forEach(pattern => {
            htmlContent = htmlContent.replace(pattern, `src="${correctPath}"`);
          });
          
          // 找出所有 script 標籤並檢查
          const scriptRegex = /<script[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
          let match;
          const matches = [];
          while ((match = scriptRegex.exec(htmlContent)) !== null) {
            matches.push({ full: match[0], src: match[1] });
          }
          
          // 替換所有錯誤的引用
          matches.forEach(m => {
            const currentSrc = m.src;
            if (currentSrc !== correctPath && (currentSrc.includes('app.js') || currentSrc.includes('main.js') || currentSrc.includes('scripts/') || currentSrc.includes('js/'))) {
              htmlContent = htmlContent.replace(m.full, `<script src="${correctPath}"></script>`);
            }
          });
          
          // 如果還是沒有正確的引用，強制添加或替換
          if (!htmlContent.includes(`src="${correctPath}"`)) {
            if (htmlContent.includes('<script')) {
              // 替換所有 script 標籤
              htmlContent = htmlContent.replace(/<script[^>]*src=["'][^"']+["'][^>]*><\/script>/gi, 
                `<script src="${correctPath}"></script>`);
            } else if (htmlContent.includes('</body>')) {
              htmlContent = htmlContent.replace('</body>', `  <script src="${correctPath}"></script>\n</body>`);
            }
          }
        }
      });
    
    return htmlContent;
  }
}

module.exports = MarkupGenerator;
