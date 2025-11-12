# Worker Agents Architecture

這是 Coder Agent 系統的 Worker Agent 架構，每個 Worker Agent 專門處理特定類型的代碼生成。

## Architecture Overview

```
Coordinator (Phase 2: Detail Generation)
    │
    ├─> Markup Agent (Port 3801)    - HTML/XML/Markdown
    ├─> Style Agent (Port 3802)     - CSS/SCSS/SASS
    ├─> Script Agent (Port 3803)    - JavaScript/TypeScript
    ├─> Python Agent (Port 3804)    - Python
    └─> System Agent (Port 3805)    - C/C++/Go/Rust/Java/C#
```

## Core Principle: Skeleton Expansion

每個 Worker Agent 都遵循 **骨架擴展策略**：

1. **Check Skeleton** - 檢查 skeleton 參數是否存在
2. **Expand Skeleton** - 如果有骨架，基於骨架填充細節
3. **Fallback Generation** - 如果沒有骨架，從頭生成（fallback）

```javascript
async generateWithMock({ skeleton, fileSpec, context }) {
  if (skeleton && skeleton.trim().length > 0) {
    console.log('[Generator] Expanding skeleton with details');
    return this.expandSkeleton(skeleton, fileSpec, context);
  }
  
  console.log('[Generator] No skeleton provided, generating from scratch');
  return this.generateFromScratch(fileSpec, context);
}
```

## Worker Agents

### 1. Markup Agent (Port 3801)

**Files:**
- `server.js` (80 lines)
- `generator.js` (523 lines)

**Supported Extensions:**
- `.html`, `.htm`, `.xml`, `.xhtml`, `.markdown`, `.md`

**Key Features:**
- Analyzes skeleton structure (doctype, html, head, body, sections)
- Replaces `<title>` with actual description
- Adds CSS links if missing (`<link rel="stylesheet">`)
- Adds JS scripts if missing (`<script src="">`)
- Expands `<!-- comments -->` into actual HTML content
- Enhances structure: meta tags, IDs, attributes

**Skeleton Expansion Methods:**
```javascript
expandHTMLSkeleton()     // Main expansion logic
analyzeSkeletonStructure() // Analyze what exists in skeleton
expandComments()          // Replace comments with content
enhanceHTMLStructure()    // Add missing meta/attributes
```

---

### 2. Style Agent (Port 3802)

**Files:**
- `server.js` (80 lines)
- `generator.js` (350+ lines)

**Supported Extensions:**
- `.css`, `.scss`, `.sass`, `.less`

**Key Features:**
- Extracts selectors from completed HTML files
- Analyzes existing CSS skeleton for selectors
- Fills empty CSS rules (`{}`)
- Generates missing styles for HTML elements
- Creates responsive and accessible styles

**Context Awareness:**
```javascript
// Extracts .classes, #ids, and element tags from HTML
extractSelectorsFromHTML(context)

// Example:
// HTML: <div class="card" id="main-card">
// CSS: .card { ... } #main-card { ... }
```

**Skeleton Expansion Methods:**
```javascript
expandCSSSkeleton()          // Main expansion logic
extractSelectorsFromHTML()   // Parse completed HTML files
analyzeCSSSkeleton()         // Find existing selectors
fillEmptySelectors()         // Add properties to {} rules
generateMissingStyles()      // Create new rules
```

---

### 3. Script Agent (Port 3803)

**Files:**
- `server.js` (80 lines)
- `generator.js` (600+ lines)

**Supported Extensions:**
- `.js`, `.ts`, `.jsx`, `.tsx`, `.mjs`, `.cjs`

**Key Features:**
- Extracts DOM elements from completed HTML files
- Analyzes skeleton for functions, classes, event listeners
- Fills empty functions with basic implementation
- Adds event listeners based on HTML elements
- Generates chart/table/form/modal/API functions

**Context Awareness:**
```javascript
// Extracts elements with IDs or special classes from HTML
extractDOMElementsFromHTML(context)

// Example:
// HTML: <button id="submit-btn">
// JS: const submitBtn = document.getElementById('submit-btn');
//     submitBtn.addEventListener('click', handleSubmitBtnClick);
```

**Skeleton Expansion Methods:**
```javascript
expandJSSkeleton()           // Main expansion logic
analyzeJSSkeleton()          // Analyze functions, classes, async
extractDOMElementsFromHTML() // Find buttons, forms, etc.
expandJSComments()           // Replace // IMPLEMENTED comments
fillEmptyFunctions()         // Add console.log to {} functions
addEventListeners()          // Setup DOM event handlers
addUtilityFunctions()        // Add debounce, throttle, etc.
```

---

### 4. Python Agent (Port 3804)

**Files:**
- `server.js` (80 lines)
- `generator.js` (550+ lines)

**Supported Extensions:**
- `.py`, `.pyw`, `.pyi`

**Key Features:**
- Detects module type (model/service/controller/utils/config/test)
- Generates appropriate class structures
- Adds missing imports automatically
- Enhances type hints
- Adds docstrings to functions/classes

**Module Types:**
- **Model** - `@dataclass`, `to_dict()`, `from_dict()`
- **Service** - Business logic with logging
- **Controller** - Flask/FastAPI endpoints (index, get, create, update, delete)
- **Utils** - Helper functions
- **Config** - Environment variables, settings
- **Test** - `unittest.TestCase` with setUp/tearDown

**Skeleton Expansion Methods:**
```javascript
expandPythonSkeleton()       // Main expansion logic
analyzePythonSkeleton()      // Detect classes, functions, imports
expandPythonComments()       // Replace # IMPLEMENTED comments
fillEmptyFunctions()         // Add pass to empty def
addMissingImports()          // Auto-import datetime, typing, etc.
enhanceTypeHints()           // Add -> None to functions
addDocstrings()              // Add """TODO""" to functions/classes
```

---

### 5. System Agent (Port 3805)

**Files:**
- `server.js` (80 lines)
- `generator.js` (700+ lines)

**Supported Extensions:**
- `.c`, `.h`, `.cpp`, `.cc`, `.cxx`, `.hpp`
- `.go`
- `.rs`
- `.java`
- `.cs`

**Key Features:**
- Multi-language support (6 languages)
- Header/source file distinction
- Include guards for C/C++ headers
- Package/namespace detection
- Initialize/Process/Cleanup pattern

**Language-Specific Patterns:**

**C/C++:**
- Header guards (`#ifndef FILENAME_H`)
- Include statements
- Function declarations/definitions

**Go:**
- Package declaration
- Struct methods
- Error handling with `error` return type

**Rust:**
- Module documentation (`//!`)
- Struct with `impl` blocks
- Result<T, E> return types

**Java:**
- Package extraction from file path
- Class with constructor
- Main method

**C#:**
- Namespace from directory structure
- Properties and methods
- Exception handling

**Skeleton Expansion Methods:**
```javascript
expandCSkeleton()            // C expansion
expandCppSkeleton()          // C++ expansion
expandGoSkeleton()           // Go expansion
expandRustSkeleton()         // Rust expansion
expandJavaSkeleton()         // Java expansion
expandCSharpSkeleton()       // C# expansion
```

---

## API Endpoints

All agents share the same API structure:

### GET /health
Returns agent status and supported file extensions.

**Response:**
```json
{
  "status": "ok",
  "agent": "markup-agent",
  "port": 3801,
  "supportedExtensions": [".html", ".htm", ".xml"]
}
```

### POST /generate
Generates code based on skeleton and context.

**Request:**
```json
{
  "skeleton": "<!DOCTYPE html>...",
  "fileSpec": {
    "path": "src/dashboard.html",
    "language": "html",
    "description": "Stock trading dashboard",
    "requirements": ["Interactive charts", "Real-time data"]
  },
  "context": {
    "completedFiles": [
      {
        "path": "styles.css",
        "content": "body { font-family: Arial; }"
      }
    ],
    "dependencies": ["styles.css"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "content": "<!DOCTYPE html><html>...",
  "metadata": {
    "agent": "markup-agent",
    "file": "src/dashboard.html",
    "language": "html",
    "tokens_used": 350,
    "generation_time_ms": 45,
    "method": "skeleton-expansion"
  }
}
```

---

## Context Awareness

Worker agents receive `context.completedFiles` array containing files completed in previous layers. This enables:

1. **Style Agent** - Extract CSS selectors from HTML files
2. **Script Agent** - Find DOM elements (IDs, classes) from HTML
3. **All Agents** - Reference dependencies for imports/includes

**Example Flow:**

```
Layer 1: Markup Agent generates dashboard.html
  └─> Contains: <button id="refresh-btn" class="btn-primary">
  
Layer 2: Style Agent generates styles.css
  └─> Extracts: .btn-primary, #refresh-btn from dashboard.html
  └─> Generates: .btn-primary { ... } #refresh-btn { ... }
  
Layer 3: Script Agent generates app.js
  └─> Extracts: #refresh-btn from dashboard.html
  └─> Generates: document.getElementById('refresh-btn').addEventListener(...)
```

---

## Development & Testing

### Start Individual Agent

```powershell
cd worker-agents/markup-agent
npm install
node server.js
```

### Start All Agents

```powershell
# Terminal 1
cd worker-agents/markup-agent; node server.js

# Terminal 2
cd worker-agents/style-agent; node server.js

# Terminal 3
cd worker-agents/script-agent; node server.js

# Terminal 4
cd worker-agents/python-agent; node server.js

# Terminal 5
cd worker-agents/system-agent; node server.js
```

### Test Health Check

```powershell
Invoke-RestMethod -Uri 'http://localhost:3801/health'
Invoke-RestMethod -Uri 'http://localhost:3802/health'
Invoke-RestMethod -Uri 'http://localhost:3803/health'
Invoke-RestMethod -Uri 'http://localhost:3804/health'
Invoke-RestMethod -Uri 'http://localhost:3805/health'
```

### Test Generation

```powershell
$body = @{
  skeleton = '<!DOCTYPE html><html><head><!-- head --></head><body><!-- content --></body></html>'
  fileSpec = @{
    path = 'test.html'
    language = 'html'
    description = 'Test page'
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri 'http://localhost:3801/generate' -Method Post -Body $body -ContentType 'application/json'
```

---

## Integration with Coordinator

**Next Steps:**

1. Update `coder-agent/coordinator.js` Phase 2
2. Replace `mockCloudAPI()` with real HTTP calls to worker agents
3. Route files to correct agent based on file extension
4. Pass skeleton and context correctly

**Example Coordinator Integration:**

```javascript
async generateDetailsWithLayers(files, allFiles) {
  const { order, groups, depGraph } = this.dependencyAnalyzer.analyze(files);
  
  for (let layerIdx = 0; layerIdx < groups.length; layerIdx++) {
    const layer = groups[layerIdx];
    
    const layerPromises = layer.map(async (filePath) => {
      const file = allFiles.find(f => f.path === filePath);
      const ext = path.extname(filePath).toLowerCase();
      
      // Route to correct worker agent
      let agentUrl;
      if (['.html', '.xml', '.md'].includes(ext)) {
        agentUrl = 'http://localhost:3801/generate';
      } else if (['.css', '.scss'].includes(ext)) {
        agentUrl = 'http://localhost:3802/generate';
      } else if (['.js', '.ts'].includes(ext)) {
        agentUrl = 'http://localhost:3803/generate';
      } else if (ext === '.py') {
        agentUrl = 'http://localhost:3804/generate';
      } else {
        agentUrl = 'http://localhost:3805/generate';
      }
      
      // Call worker agent
      const response = await fetch(agentUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skeleton: file.skeleton,
          fileSpec: {
            path: file.path,
            language: file.language,
            description: file.description,
            requirements: file.requirements
          },
          context: {
            completedFiles: this.getCompletedFiles(filePath, completedFiles),
            dependencies: completedDeps
          }
        })
      });
      
      const result = await response.json();
      return {
        ...file,
        content: result.content,
        tokens: result.metadata.tokens_used
      };
    });
    
    const layerResults = await Promise.all(layerPromises);
    completedFiles.push(...layerResults);
  }
}
```

---

## Performance

**Mock Mode (Current):**
- Generation time: 1-5ms per file
- No external API calls
- Template-based generation
- Suitable for testing and development

**Cloud API Mode (Future):**
- Set `CLOUD_API_ENDPOINT` and `CLOUD_API_KEY`
- Real AI-powered generation
- Higher quality, context-aware code
- Generation time: 500-3000ms per file

---

## File Structure

```
worker-agents/
├── markup-agent/
│   ├── package.json
│   ├── server.js (80 lines)
│   ├── generator.js (523 lines)
│   ├── test_agent.py
│   └── test_skeleton.py
│
├── style-agent/
│   ├── package.json
│   ├── server.js (80 lines)
│   └── generator.js (350+ lines)
│
├── script-agent/
│   ├── package.json
│   ├── server.js (80 lines)
│   └── generator.js (600+ lines)
│
├── python-agent/
│   ├── package.json
│   ├── server.js (80 lines)
│   └── generator.js (550+ lines)
│
└── system-agent/
    ├── package.json
    ├── server.js (80 lines)
    └── generator.js (700+ lines)
```

**Total Lines of Code:** ~3,500 lines

---

## Key Design Decisions

1. **Microservices Architecture** - Each agent runs independently on its own port
2. **Skeleton-First Strategy** - Expand existing structure rather than regenerate
3. **Context Awareness** - Agents receive completed files to extract dependencies
4. **Language Specialization** - Each agent focuses on specific language families
5. **Fallback Mechanism** - Can generate from scratch if skeleton missing
6. **Mock Mode First** - Fast template-based generation for testing
7. **Unified API** - All agents share same request/response format

---

## Future Enhancements

1. **Cloud API Integration** - Connect to real LLM for high-quality generation
2. **Caching Layer** - Cache generated code for similar requests
3. **Validation** - Syntax checking before returning results
4. **Incremental Updates** - Diff-based updates instead of full regeneration
5. **Multi-language Support** - Add more languages (Swift, Kotlin, PHP, etc.)
6. **Configuration** - Per-agent configuration for style preferences
7. **Metrics** - Track generation quality, speed, token usage
8. **Load Balancing** - Multiple instances of same agent for scalability

---

Generated: 2025-11-06
Last Updated: 2025-11-06
Version: 1.0.0
