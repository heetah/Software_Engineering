/**
 * System Generator - 簡化版本
 * 只包含雲端 API 調用和簡單 fallback
 * 支援系統級語言：C/C++/Go/Rust/Java/C#
 */

const path = require('path');
const { callCloudAPI } = require('../api-adapter');

class SystemGenerator {
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
        systemPrompt: 'You are an expert systems programmer. Generate clean, efficient, production-ready code. Follow language-specific best practices. Include proper error handling and documentation. Output only the code.',
        userPrompt: prompt,
        maxTokens: 4000
      });
      
      // 清理可能的 markdown 代碼塊標記
      const cleanContent = content
        .replace(/^```[a-z]*\n/, '')
        .replace(/\n```$/, '')
        .trim();
      
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
    const { path: filePath, description } = fileSpec;
    const ext = path.extname(filePath).toLowerCase();
    
    let content;
    
    // 根據文件類型生成簡單 fallback
    if (ext === '.c' || ext === '.h') {
      content = this.getMockC(filePath, description);
    } else if (ext === '.cpp' || ext === '.cc' || ext === '.cxx' || ext === '.hpp') {
      content = this.getMockCpp(filePath, description);
    } else if (ext === '.go') {
      content = this.getMockGo(filePath, description);
    } else if (ext === '.rs') {
      content = this.getMockRust(filePath, description);
    } else if (ext === '.java') {
      content = this.getMockJava(filePath, description);
    } else if (ext === '.cs') {
      content = this.getMockCSharp(filePath, description);
    } else {
      content = `// Mock fallback - Configure CLOUD_API_ENDPOINT\n// ${description || 'System code'}`;
    }
    
    return {
      content,
      tokensUsed: Math.ceil(content.length / 4),
      method: 'mock-fallback'
    };
  }

  getMockC(filePath, description) {
    const fileName = path.basename(filePath);
    const isHeader = fileName.endsWith('.h');
    
    if (isHeader) {
      const guard = fileName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
      return `/* Mock fallback - Configure CLOUD_API_ENDPOINT */
#ifndef ${guard}
#define ${guard}

#include <stdio.h>

#endif /* ${guard} */
`;
    }
    
    return `/* Mock fallback - Configure CLOUD_API_ENDPOINT */
#include <stdio.h>

int main(void) {
    printf("Configure CLOUD_API_ENDPOINT\\n");
    return 0;
}
`;
  }

  getMockCpp(filePath, description) {
    return `// Mock fallback - Configure CLOUD_API_ENDPOINT
#include <iostream>

int main() {
    std::cout << "Configure CLOUD_API_ENDPOINT" << std::endl;
    return 0;
}
`;
  }

  getMockGo(filePath, description) {
    return `// Mock fallback - Configure CLOUD_API_ENDPOINT
package main

import "fmt"

func main() {
    fmt.Println("Configure CLOUD_API_ENDPOINT")
}
`;
  }

  getMockRust(filePath, description) {
    return `// Mock fallback - Configure CLOUD_API_ENDPOINT
fn main() {
    println!("Configure CLOUD_API_ENDPOINT");
}
`;
  }

  getMockJava(filePath, description) {
    const fileName = path.basename(filePath, '.java');
    return `// Mock fallback - Configure CLOUD_API_ENDPOINT
public class ${fileName} {
    public static void main(String[] args) {
        System.out.println("Configure CLOUD_API_ENDPOINT");
    }
}
`;
  }

  getMockCSharp(filePath, description) {
    return `// Mock fallback - Configure CLOUD_API_ENDPOINT
using System;

class Program {
    static void Main(string[] args) {
        Console.WriteLine("Configure CLOUD_API_ENDPOINT");
    }
}
`;
  }

  buildPrompt({ skeleton, fileSpec, context }) {
    const { path: filePath, description, requirements = [] } = fileSpec;
    const ext = path.extname(filePath).toLowerCase();
    const completedFiles = context.completedFiles || [];
    const contracts = context.contracts || null;
    
    // 偵測語言
    let language = 'C';
    if (['.cpp', '.cc', '.cxx', '.hpp'].includes(ext)) language = 'C++';
    else if (ext === '.go') language = 'Go';
    else if (ext === '.rs') language = 'Rust';
    else if (ext === '.java') language = 'Java';
    else if (ext === '.cs') language = 'C#';
    
    let prompt = `Generate ${language} code for: ${filePath}\n\n`;
    
    if (description) {
      prompt += `Description: ${description}\n\n`;
    }
    
    if (requirements.length > 0) {
      prompt += `Requirements:\n${requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }
    
    // ← 新增：如果有 contracts，優先顯示
    if (contracts) {
      prompt += `=== CONTRACTS (MUST FOLLOW EXACTLY) ===\n`;
      
      // API contracts - 對系統語言可能是實現 FFI/JNI 接口
      if (contracts.api && contracts.api.length > 0) {
        const relevantApis = contracts.api.filter(api => 
          api.producers.includes(filePath) || api.consumers.includes(filePath)
        );
        
        if (relevantApis.length > 0) {
          prompt += `\nAPI Interfaces:\n`;
          relevantApis.forEach(api => {
            prompt += `  ${api.endpoint} - ${api.description}\n`;
            if (api.request) prompt += `  Request: ${JSON.stringify(api.request)}\n`;
            if (api.response) prompt += `  Response: ${JSON.stringify(api.response)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      // Module contracts - 導出的函數/類別
      if (contracts.modules && contracts.modules.length > 0) {
        const relevantModules = contracts.modules.filter(mod => 
          mod.file === filePath
        );
        
        if (relevantModules.length > 0) {
          prompt += `Modules to export:\n`;
          relevantModules.forEach(mod => {
            prompt += `  ${mod.name}\n`;
            prompt += `  Exports: ${JSON.stringify(mod.exports, null, 2)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      // Class contracts
      if (contracts.classes && contracts.classes.length > 0) {
        const relevantClasses = contracts.classes.filter(cls => 
          cls.file === filePath
        );
        
        if (relevantClasses.length > 0) {
          prompt += `Classes/Structs to define:\n`;
          relevantClasses.forEach(cls => {
            prompt += `  ${cls.name}\n`;
            prompt += `  Fields: ${JSON.stringify(cls.fields, null, 2)}\n`;
            if (cls.methods) prompt += `  Methods: ${JSON.stringify(cls.methods, null, 2)}\n`;
          });
          prompt += `\n`;
        }
      }
      
      prompt += `=== END CONTRACTS ===\n\n`;
    }
    
    // Include context from other files
    if (completedFiles.length > 0) {
      prompt += `Related files:\n`;
      completedFiles.forEach(f => {
        prompt += `- ${f.path} (${f.language})\n`;
      });
      prompt += '\n';
    }
    
    if (skeleton) {
      prompt += `Skeleton:\n\`\`\`${language.toLowerCase()}\n${skeleton}\n\`\`\`\n\n`;
    }
    
    prompt += `Generate complete, production-ready ${language} with:\n`;
    prompt += `- Proper error handling and safety checks\n`;
    prompt += `- Memory safety and resource management (RAII for C++, ownership for Rust)\n`;
    prompt += `- Comprehensive documentation comments\n`;
    prompt += `- Language-specific best practices and idioms\n`;
    prompt += `- Efficient algorithms and data structures\n`;
    prompt += `- CRITICAL: Function signatures, class/struct names must match skeleton exactly\n`;
    if (contracts) {
      prompt += `- CRITICAL: Follow contract structures EXACTLY - field names, types, signatures must match\n`;
    }
    prompt += `- CRITICAL: If interfacing with other languages (FFI, JNI), ensure exact ABI compatibility\n`;
    prompt += `- CRITICAL: Header guards, namespace, package names must be consistent across related files\n\n`;
    prompt += `Return ONLY the code, no markdown.`;
    
    return prompt;
  }
}

module.exports = SystemGenerator;
