/**
 * Base Generator - 所有生成器的基類
 */

export default class BaseGenerator {
  /**
   * 生成 HTML 內容
   * @param {Object} fileSpec - 文件規格 { path, language, description }
   * @param {string} skeleton - 現有的骨架代碼
   * @returns {string} 生成的 HTML 內容
   */
  generateHTML(fileSpec, skeleton) {
    // 子類應該實現這個方法
    return skeleton;
  }

  /**
   * 生成 JavaScript 內容
   * @param {Object} fileSpec - 文件規格
   * @param {string} skeleton - 現有的骨架代碼
   * @param {Object} context - 上下文信息
   * @returns {string} 生成的 JavaScript 內容
   */
  generateJavaScript(fileSpec, skeleton, context) {
    // 子類應該實現這個方法
    return skeleton;
  }

  /**
   * 生成 CSS 內容
   * @param {Object} fileSpec - 文件規格
   * @param {Array} htmlFiles - HTML 文件列表
   * @returns {string|null} 生成的 CSS 內容
   */
  generateCSS(fileSpec, htmlFiles) {
    // 子類應該實現這個方法
    return null;
  }

  /**
   * 確保 HTML 有基本的 meta 標籤
   */
  ensureMetaTags(htmlContent) {
    if (!htmlContent.includes('<meta charset')) {
      htmlContent = htmlContent.replace(
        /<head>/i,
        `<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">`
      );
    }
    return htmlContent;
  }
}

