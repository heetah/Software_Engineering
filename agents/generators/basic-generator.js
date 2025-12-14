/**
 * Basic Generator - 生成基本的 HTML/CSS/JS 模板
 */

import BaseGenerator from './base-generator.js';

export default class BasicGenerator extends BaseGenerator {
  /**
   * 生成基本的 HTML
   */
  generateHTML(fileSpec, skeleton) {
    let htmlContent = skeleton;
    
    // 確保有 meta 標籤
    htmlContent = this.ensureMetaTags(htmlContent);
    
    // 如果 skeleton 已經很完整，直接返回
    const hasTodo = /TODO|FIXME/i.test(htmlContent);
    if (!hasTodo && htmlContent.length > 200) {
      return htmlContent;
    }
    
    // 替換 TODO 註釋
    htmlContent = htmlContent.replace(/<!--\s*TODO:?\s*Implement\s*[^-]*-->/gi, '');
    htmlContent = htmlContent.replace(/<!--\s*TODO[^-]*-->/gi, '');
    
    // 如果 body 內容太簡單，添加基本結構
    if (htmlContent.includes('<body>') && htmlContent.includes('</body>')) {
      const bodyMatch = htmlContent.match(/<body>([\s\S]*?)<\/body>/i);
      if (bodyMatch && bodyMatch[1].trim().length < 50) {
        htmlContent = htmlContent.replace(
          /<body>([\s\S]*?)<\/body>/i,
          `<body>
    <div class="container">
        <header>
            <h1>${fileSpec.description || 'Application'}</h1>
        </header>
        <main>
            <div class="content">
                <p>Welcome to ${fileSpec.description || 'the application'}</p>
            </div>
        </main>
        <footer>
            <p>&copy; 2025</p>
        </footer>
    </div>
    <link rel="stylesheet" href="styles.css">
    <script src="script.js"></script>
</body>`
        );
      }
    }
    
    return htmlContent;
  }

  /**
   * 生成基本的 JavaScript
   */
  generateJavaScript(fileSpec, skeleton, context) {
    // 如果 skeleton 已經很完整，直接返回
    if (skeleton.length > 100 && !skeleton.includes('TODO')) {
      return skeleton;
    }
    
    // 生成基本實現
    return `// ${fileSpec.description || 'Implementation'}

${skeleton}

// Basic implementation
console.log('${fileSpec.path} loaded');

// Add your functionality here`;
  }

  /**
   * 生成基本的 CSS
   */
  generateCSS(fileSpec, htmlFiles) {
    return `/* Basic Styles */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    line-height: 1.6;
    color: #333;
    background: #f4f4f4;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    background: #667eea;
    color: white;
    padding: 20px;
    text-align: center;
    border-radius: 10px 10px 0 0;
}

header h1 {
    margin: 0;
}

main {
    background: white;
    padding: 20px;
    border-radius: 0 0 10px 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
}

.content {
    padding: 20px;
}

footer {
    text-align: center;
    padding: 20px;
    color: #666;
}`;
  }
}

