# 🤖 Software Engineering Project

AI-powered code generation system with vision and coder agents.

## 📋 Table of Contents

- [Quick Start](#-quick-start)
- [🔐 Security Setup (IMPORTANT!)](#-security-setup-important)
- [Project Structure](#-project-structure)
- [Architecture](#-architecture)
- [Usage](#-usage)
- [Documentation](#-documentation)

---

## 🚀 Quick Start

### 1. Clone the Repository
```powershell
git clone https://github.com/heetah/Software_Engineering.git
cd Software_Engineering
```

### 2. Install Dependencies
```powershell
npm install
```

### 3. Configure Environment Variables (🔐 IMPORTANT!)
```powershell
# Copy the example file
Copy-Item .env.example .env

# Edit .env and add your API key
notepad .env
```

**Required environment variables:**
```env
CLOUD_API_KEY=your-google-cloud-api-key-here
CLOUD_API_ENDPOINT=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent
```

> ⚠️ **NEVER commit `.env` to Git!** See [SECURITY.md](./SECURITY.md) for details.

### 4. Run the System
```powershell
# Start vision agent server
node vision-agent/server.js

# In another terminal, start coder agent server
node coder-agent/server.js
```

---

## 🔐 Security Setup (IMPORTANT!)

### ⚠️ What NOT to Push to GitHub

**❌ NEVER commit these files:**
- `.env` - Contains real API keys
- `node_modules/` - Third-party packages (too large)
- `outputs/` - Generated files
- Any file with hardcoded API keys

**✅ Safe to commit:**
- `.env.example` - Template without real keys
- `.gitignore` - Git ignore rules
- `package.json` - Package list
- Source code (ensure no hardcoded keys)

### 🛡️ Pre-commit Checklist

Before `git push`, always run:

```powershell
# Check staged files
git status

# Verify .env is ignored
git check-ignore .env
# Should output: .env

# Search for accidentally hardcoded API keys
Select-String -Path .\*.js,.\*.py -Pattern "AIza" -Exclude ".env*"
```

### 📖 Full Security Guide

Read [SECURITY.md](./SECURITY.md) for:
- Complete setup instructions
- What to do if you accidentally leaked an API key
- Team collaboration best practices
- Environment variable management

---

## 📁 Project Structure

```
Software_Engineering/
├── .env.example          # Environment variable template
├── .gitignore           # Git ignore rules
├── SECURITY.md          # 🔐 Security guide (READ THIS!)
├── package.json         # Node.js dependencies
│
├── vision-agent/        # Vision & Architecture Agent
│   ├── server.js
│   ├── ocr.py
│   └── controllers/
│
├── coder-agent/         # Code Generation Coordinator
│   ├── server.js
│   ├── processor.js
│   ├── worker.js
│   └── outputs/
│
├── worker-agents/       # Specialized Code Generators
│   ├── markup-agent/    # HTML generation
│   ├── style-agent/     # CSS generation
│   ├── script-agent/    # JavaScript generation
│   ├── python-agent/    # Python generation
│   └── system-agent/    # Config files
│
└── test_payloads/       # Test data & specifications
    ├── standard_payload_spec.json  # Universal payload schema
    └── test_config_generation.json
```

---

## 🏗️ Architecture

```
User Input (Image/Text)
        ↓
┌───────────────────┐
│  Vision Agent     │ ← OCR + AI Analysis
│  (server.js)      │
└────────┬──────────┘
         │ Generates payload
         ↓
┌───────────────────┐
│  Coder Agent      │ ← Orchestrator
│  (coordinator.js) │
└────────┬──────────┘
         │ Dispatches tasks
         ↓
┌─────────────────────────────────────┐
│  Worker Agents (Parallel)           │
├─────────────────────────────────────┤
│ • Markup Agent  → HTML              │
│ • Style Agent   → CSS               │
│ • Script Agent  → JavaScript        │
│ • Python Agent  → Python (Flask)    │
│ • System Agent  → Config files      │
└─────────────────────────────────────┘
         ↓
    Generated Code Files
```

---

## 💻 Usage

### Generate Code from UI Mockup

```powershell
# 1. Start vision agent
node vision-agent/server.js

# 2. Send image for analysis
curl -X POST http://localhost:5000/api/vision/analyze `
  -F "image=@path/to/mockup.png" `
  -F "task=Build a chat application"

# 3. Vision agent generates payload → Coder agent generates code
# Check outputs in: coder-agent/outputs/coder-YYYY-MM-DDTHHMM/
```

### Generate Code from JSON Payload

```powershell
# Use test payloads
node send_to_coder_agent.js test_payloads/test_config_generation.json
```

---

## 📚 Documentation

- **[SECURITY.md](./SECURITY.md)** - 🔐 API Key protection guide (MUST READ!)
- **[UNIVERSAL_SOLUTION.md](./UNIVERSAL_SOLUTION.md)** - Architecture & problem analysis
- **[IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)** - Implementation status
- **[test_payloads/standard_payload_spec.json](./test_payloads/standard_payload_spec.json)** - Payload schema
- **[worker-agents/README.md](./worker-agents/README.md)** - Worker agents documentation

---

## 🔧 Development

### Install New Packages
```powershell
npm install <package-name>
```

### Add New Environment Variable
1. Add to `.env.example` with a placeholder
2. Update [SECURITY.md](./SECURITY.md)
3. Update this README
4. Notify team members

### Run Tests
```powershell
# Test payload generation
node test_payloads/run_tests.ps1
```

---

## 🤝 Contributing

### Before Committing

1. **Check for API keys:**
   ```powershell
   Select-String -Path .\*.js,.\*.py -Pattern "AIza"
   ```

2. **Verify .gitignore:**
   ```powershell
   git status
   # Should NOT see .env or node_modules/
   ```

3. **Update documentation if needed**

### Git Workflow

```powershell
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: description of changes"

# Push to your branch (NOT main!)
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

---

## ⚠️ Common Issues

### "API Key not found"
- Check if `.env` file exists
- Verify `CLOUD_API_KEY` is set in `.env`
- Make sure you didn't commit `.env` to git (use `.env.example` instead)

### "node_modules too large to push"
- Run: `git rm -r --cached node_modules/`
- Verify `.gitignore` contains `node_modules/`
- Never commit `node_modules/` - use `package.json` instead

### "Cannot find module"
- Run: `npm install`
- Check if package is listed in `package.json`

---

## 📞 Support

- Read [SECURITY.md](./SECURITY.md) for security issues
- Check `worker-agents/README.md` for agent-specific docs
- Review `test_payloads/standard_payload_spec.json` for payload format

---

## 📜 License

[Add your license here]

---

## 🔥 Important Reminders

1. 🔐 **NEVER commit `.env` with real API keys**
2. 📦 **NEVER commit `node_modules/`** (use `package.json`)
3. 📖 **Read [SECURITY.md](./SECURITY.md) before pushing**
4. ✅ **Always run `git status` before `git push`**
5. 🔍 **Use `.env.example` for templates, `.env` for real values**

**Questions about security? → Read [SECURITY.md](./SECURITY.md)**
