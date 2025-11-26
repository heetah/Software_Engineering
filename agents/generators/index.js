/**
 * Content Generators - 根據關鍵字和文件類型生成完整的代碼內容
 * 
 * 這個模組包含各種內容生成器，用於根據關鍵字（如 "calculator", "計算機"）
 * 生成完整、實用的代碼模板。
 */

import CalculatorGenerator from './calculator-generator.js';
import BasicGenerator from './basic-generator.js';

export default class ContentGenerators {
  constructor() {
    this.generators = {
      calculator: new CalculatorGenerator(),
      basic: new BasicGenerator()
    };
  }

  /**
   * 檢測應該使用哪個生成器
   * @param {Object} fileSpec - 文件規格 { path, language, description }
   * @returns {string} 生成器名稱
   */
  detectGenerator(fileSpec) {
    const description = (fileSpec.description || '').toLowerCase();
    const path = (fileSpec.path || '').toLowerCase();
    
    const text = `${description} ${path}`;
    
    // 檢測計算機相關關鍵字
    if (text.includes('calculator') || text.includes('計算') || 
        text.includes('計算機') || text.includes('calc')) {
      return 'calculator';
    }
    
    // 默認使用基本生成器
    return 'basic';
  }

  /**
   * 生成 HTML 內容
   * @param {Object} fileSpec - 文件規格
   * @param {string} skeleton - 現有的骨架代碼
   * @returns {string} 生成的 HTML 內容
   */
  generateHTML(fileSpec, skeleton) {
    const generatorName = this.detectGenerator(fileSpec);
    const generator = this.generators[generatorName] || this.generators.basic;
    
    return generator.generateHTML(fileSpec, skeleton);
  }

  /**
   * 生成 JavaScript 內容
   * @param {Object} fileSpec - 文件規格
   * @param {string} skeleton - 現有的骨架代碼
   * @param {Object} context - 上下文信息
   * @returns {string} 生成的 JavaScript 內容
   */
  generateJavaScript(fileSpec, skeleton, context) {
    const generatorName = this.detectGenerator(fileSpec);
    const generator = this.generators[generatorName] || this.generators.basic;
    
    return generator.generateJavaScript(fileSpec, skeleton, context);
  }

  /**
   * 生成 CSS 內容
   * @param {Object} fileSpec - 文件規格
   * @param {Array} htmlFiles - HTML 文件列表（用於檢測需要什麼樣式）
   * @returns {string|null} 生成的 CSS 內容，如果不需要則返回 null
   */
  generateCSS(fileSpec, htmlFiles) {
    const generatorName = this.detectGenerator(fileSpec);
    const generator = this.generators[generatorName] || this.generators.basic;
    
    return generator.generateCSS(fileSpec, htmlFiles);
  }

  /**
   * 檢查是否需要生成 CSS 文件
   * @param {Array} htmlFiles - HTML 文件列表
   * @param {Array} cssFiles - 現有的 CSS 文件列表
   * @returns {Object|null} { path, content } 如果需要生成 CSS，否則返回 null
   */
  checkAndGenerateCSS(htmlFiles, cssFiles) {
    // 檢查 HTML 文件是否引用了 CSS
    const needsCSS = htmlFiles.some(htmlFile => {
      const htmlContent = htmlFile.template || '';
      return htmlContent.includes('styles.css') || htmlContent.includes('style.css');
    });

    if (needsCSS && cssFiles.length === 0) {
      // 檢測應該使用哪個生成器
      const generatorName = this.detectGenerator({ 
        description: htmlFiles[0]?.description || '',
        path: htmlFiles[0]?.path || ''
      });
      const generator = this.generators[generatorName] || this.generators.basic;
      
      const cssContent = generator.generateCSS({ path: 'public/styles.css' }, htmlFiles);
      
      if (cssContent) {
        return {
          path: 'public/styles.css',
          content: cssContent,
          language: 'css'
        };
      }
    }

    return null;
  }
}

