/**
 * Style Generator - 簡化版本
 * 只包含雲端 API 調用和簡單 fallback
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class StyleGenerator {
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

  async generateWithCloudAPI({ skeleton, fileSpec, context }) {
    const prompt = this.buildPrompt({ skeleton, fileSpec, context });
    
    try {
      const { content, tokensUsed } = await callCloudAPI({
        endpoint: this.cloudApiEndpoint,
        apiKey: this.cloudApiKey,
        systemPrompt: 'You are an expert CSS developer. Generate clean, modern CSS with proper organization. Output only the code.',
        userPrompt: prompt,
        maxTokens: 16384  // Increased from 8192 to prevent truncation
      });
      
      if (!content || content.trim() === '') {
        console.warn('[Generator] API returned empty content despite consuming tokens:', tokensUsed);
        throw new Error('API returned empty content (possibly blocked by safety filters)');
      }
      
      const cleanContent = content
        .replace(/^```css\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '')
        .trim();
      
      if (!cleanContent) {
        console.warn('[Generator] Content became empty after cleaning. Original length:', content.length);
        throw new Error('Content became empty after markdown removal');
      }
      
      // 驗證並修正 CSS，確保匹配 HTML 結構
      cleanContent = this.ensureCompleteStyling(cleanContent, context);
      
      return {
        content: cleanContent,
        tokensUsed,
        method: 'cloud-api'
      };
      
    } catch (error) {
      console.error('[Generator] API error:', error.message);
      return this.generateWithMock({ skeleton, fileSpec, context });
    }
  }

  async generateWithMock({ skeleton, fileSpec, context }) {
    const { description } = fileSpec;
    
    const content = `/* Mock fallback - Configure CLOUD_API_ENDPOINT for real generation */
/* ${description || 'Styles'} */

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    line-height: 1.6;
    color: #333;
}
`;
    
    return {
      content,
      tokensUsed: Math.ceil(content.length / 4),
      method: 'mock-fallback'
    };
  }

  buildPrompt({ skeleton, fileSpec, context }) {
    const { path: filePath, description, requirements = [] } = fileSpec;
    const completedFiles = context.completedFiles || [];
    const contracts = context.contracts || null;
    
    let prompt = `Generate CSS for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：contracts 對 CSS 影響較小，但可提示相關檔案
    if (contracts) {
      const allHtmlFiles = context.allFiles?.filter(f => f.path.endsWith('.html')) || [];
      if (allHtmlFiles.length > 0) {
        prompt += `Related HTML files: ${allHtmlFiles.map(f => f.path).join(', ')}\n`;
        prompt += `Ensure all HTML classes and IDs are styled.\n\n`;
      }
    }
    
    // Include HTML structure if available - CRITICAL for matching selectors
    const htmlFiles = completedFiles.filter(f => f.language === 'html' || f.path.endsWith('.html'));
    if (htmlFiles.length > 0) {
      prompt += `\n=== EXISTING HTML STRUCTURE (MUST STYLE ALL ELEMENTS) ===\n`;
      htmlFiles.forEach(htmlFile => {
        prompt += `\nHTML File: ${htmlFile.path}\n`;
        prompt += `Content:\n\`\`\`html\n${htmlFile.content}\n\`\`\`\n`;
        prompt += `\nCRITICAL: Your CSS MUST:\n`;
        prompt += `1. Style EVERY class, ID, and element in the HTML above\n`;
        prompt += `2. Match selectors EXACTLY (.button, #display, .calculator, etc.)\n`;
        prompt += `3. Create a beautiful, modern, and creative design\n`;
        prompt += `4. Use CSS Grid or Flexbox for proper layout\n`;
        prompt += `5. Add creative touches: gradients, shadows, animations, transitions\n`;
        prompt += `6. Ensure the design is visually appealing and professional\n`;
      });
      prompt += `=== END HTML STRUCTURE ===\n\n`;
    } else {
      // 如果 HTML 還沒生成，檢查 allFiles 中的 HTML 骨架
      const allFiles = context.allFiles || [];
      const htmlSkeletons = allFiles.filter(f => f.path.endsWith('.html') || f.path.endsWith('.htm'));
      if (htmlSkeletons.length > 0) {
        prompt += `\n=== HTML FILES TO BE GENERATED (reference for structure) ===\n`;
        htmlSkeletons.forEach(htmlFile => {
          prompt += `HTML File: ${htmlFile.path}\n`;
          if (htmlFile.description) {
            prompt += `Description: ${htmlFile.description}\n`;
          }
          // 檢查是否有對應的骨架
          const htmlSkeleton = context.allSkeletons?.[htmlFile.path];
          if (htmlSkeleton) {
            prompt += `Skeleton:\n\`\`\`html\n${htmlSkeleton}\n\`\`\`\n`;
          }
        });
        prompt += `\nNote: Generate CSS that will style all elements in the HTML structure described above.\n`;
        prompt += `=== END HTML FILES ===\n\n`;
      }
    }
    
    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`css\n${skeleton}\n\`\`\`\n\n`;
    }
    
    // 獲取使用者需求以生成創意風格
    const userRequirement = fileSpec.description || '';
    const isCalculator = userRequirement.toLowerCase().includes('calculator') || 
                        userRequirement.toLowerCase().includes('計算') ||
                        userRequirement.toLowerCase().includes('計算機');
    
    prompt += `Generate complete, production-ready CSS with:\n`;
    prompt += `- Modern layout techniques (Flexbox/Grid) - use Grid for calculator button layouts\n`;
    prompt += `- Responsive design (mobile-first approach)\n`;
    prompt += `- Creative and beautiful design with:\n`;
    prompt += `  * Modern color schemes (use gradients, not flat colors)\n`;
    prompt += `  * Smooth transitions and hover effects\n`;
    prompt += `  * Box shadows for depth (use multiple shadows for modern look)\n`;
    prompt += `  * Rounded corners (border-radius)\n`;
    prompt += `  * Creative button styles (different colors for operators vs numbers)\n`;
    if (isCalculator) {
      prompt += `  * Calculator-specific: Make display area prominent, buttons well-spaced, operator buttons visually distinct\n`;
    }
    prompt += `- Consistent color scheme and typography\n`;
    prompt += `- Interactive states (hover, focus, active) with smooth transitions\n`;
    prompt += `- CRITICAL: All selectors (.class, #id, [data-*]) MUST match HTML attributes exactly\n`;
    prompt += `- CRITICAL: Every class and ID used in HTML must have corresponding CSS rules\n`;
    prompt += `- CRITICAL: If HTML has .buttons container, style it with Grid/Flexbox for button layout\n`;
    prompt += `- CRITICAL: If HTML has .display, make it prominent and readable\n`;
    prompt += `- Ensure visual hierarchy matches the application's purpose\n`;
    prompt += `- Add your own creative style touches while maintaining functionality\n\n`;
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }

  /**
   * 確保 CSS 完整匹配 HTML 結構
   */
  ensureCompleteStyling(cssContent, context) {
    const htmlFiles = (context.completedFiles || []).filter(f => f.language === 'html' || f.path.endsWith('.html'));
    
    if (htmlFiles.length === 0) {
      return cssContent;
    }
    
    const htmlContent = htmlFiles[0].content;
    
    // 提取所有 class 和 ID
    const classes = new Set();
    const ids = new Set();
    
    // 匹配 class="..." 或 class='...'
    const classMatches = htmlContent.matchAll(/class=["']([^"']+)["']/g);
    for (const match of classMatches) {
      match[1].split(/\s+/).forEach(cls => {
        if (cls) classes.add(cls);
      });
    }
    
    // 匹配 id="..." 或 id='...'
    const idMatches = htmlContent.matchAll(/id=["']([^"']+)["']/g);
    for (const match of idMatches) {
      if (match[1]) ids.add(match[1]);
    }
    
    // 檢查 CSS 中是否缺少必要的樣式
    let missingStyles = '';
    
    // 檢查 .buttons 容器（計算機常用）
    if (classes.has('buttons') && !cssContent.includes('.buttons')) {
      missingStyles += `
.buttons {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-top: 10px;
}
`;
    }
    
    // 檢查 .display（計算機顯示區域）
    if (ids.has('display') && !cssContent.includes('#display')) {
      missingStyles += `
#display {
  width: 100%;
  padding: 20px;
  font-size: 24px;
  text-align: right;
  border: 2px solid #ddd;
  border-radius: 5px;
  margin-bottom: 10px;
  background-color: #fff;
}
`;
    }
    
    // 檢查按鈕樣式
    if (classes.has('number') && !cssContent.includes('.number')) {
      missingStyles += `
.number {
  background-color: #f0f0f0;
  color: #333;
  border: 1px solid #ddd;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.number:hover {
  background-color: #e0e0e0;
}
`;
    }
    
    if (classes.has('operator') && !cssContent.includes('.operator')) {
      missingStyles += `
.operator {
  background-color: #ff9800;
  color: white;
  border: 1px solid #f57c00;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.operator:hover {
  background-color: #f57c00;
}
`;
    }
    
    if (classes.has('equal') && !cssContent.includes('.equal')) {
      missingStyles += `
.equal {
  background-color: #4caf50;
  color: white;
  border: 1px solid #45a049;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.equal:hover {
  background-color: #45a049;
}
`;
    }
    
    if (classes.has('clear') && !cssContent.includes('.clear')) {
      missingStyles += `
.clear {
  background-color: #f44336;
  color: white;
  border: 1px solid #d32f2f;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}

.clear:hover {
  background-color: #d32f2f;
}
`;
    }
    
    // 如果有缺少的樣式，添加到 CSS 末尾
    if (missingStyles) {
      cssContent += '\n/* Auto-generated styles to match HTML structure */' + missingStyles;
    }
    
    return cssContent;
  }
}

module.exports = StyleGenerator;
