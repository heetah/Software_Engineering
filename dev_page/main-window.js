/**
 * @file 渲染器進程核心腳本 (main-window.js)
 * (最終整合版：Copy 按鈕內嵌、無亮部陰影樣式適配)
 */

const { ipcRenderer } = require('electron');

// 聊天介面相關
const chatDisplay = document.getElementById('chat-display');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const fileUploadButton = document.getElementById('file-upload-button');
const fileUploadInput = document.getElementById('file-upload-input');
const charCounter = document.getElementById('char-counter');

// 導航與頁面相關
const chatButton = document.getElementById('chat-button');
const historyButton = document.getElementById('history-button');
const settingsButton = document.getElementById('settings-button');
const historyList = document.getElementById('history-list');
const pageChat = document.getElementById('page-chat');
const pageSettings = document.getElementById('page-settings');
const helpButton = document.getElementById('help-button');
const pageHelp = document.getElementById('page-help');

// 設定頁面元素
const dataPathDisplay = document.getElementById('data-path-display');
const clearHistoryButton = document.getElementById('clear-history-button');
const themeToggle = document.getElementById('theme-toggle-input');
const llmProviderAuto = document.getElementById('llm-provider-auto');
const llmProviderGemini = document.getElementById('llm-provider-gemini');
const llmProviderOpenAI = document.getElementById('llm-provider-openai');
const geminiApiKeyInput = document.getElementById('gemini-api-key-input');
const openaiApiKeyInput = document.getElementById('openai-api-key-input');
const saveApiKeysButton = document.getElementById('save-api-keys-button');

/* 應用程式狀態 */
let currentSession = null;
let thinkingBubbleElement = null;
let currentLlmProvider = (localStorage.getItem('llmProvider') || 'auto');
let currentGeminiApiKey = localStorage.getItem('geminiApiKey') || '';
let currentOpenAIApiKey = localStorage.getItem('openaiApiKey') || '';
let currentSearchMode = localStorage.getItem('searchMode') || 'ask';

// 搜尋模式選擇
const searchModeAsk = document.getElementById('search-mode-ask');
const searchModeLens = document.getElementById('search-mode-lens');
const searchModeAi = document.getElementById('search-mode-ai');

if (searchModeAsk && searchModeLens && searchModeAi) {
  // 初始化選中狀態
  const initSearchMode = () => {
    if (currentSearchMode === 'lens') {
      searchModeLens.checked = true;
    } else if (currentSearchMode === 'ai') {
      searchModeAi.checked = true;
    } else {
      searchModeAsk.checked = true;
      currentSearchMode = 'ask';
    }
    // 同步到 Main process
    ipcRenderer.invoke('settings:set-search-mode', currentSearchMode);
  };

  initSearchMode();

  const handleSearchModeChange = (mode) => {
    currentSearchMode = mode;
    localStorage.setItem('searchMode', mode);
    ipcRenderer.invoke('settings:set-search-mode', mode);
    console.log('Search Mode changed to:', mode);
    // Add visual feedback or log
    console.log(`[UI] Syncing search mode ${mode} to Main.`);
  };

  searchModeAsk.addEventListener('change', (e) => {
    if (e.target.checked) handleSearchModeChange('ask');
  });

  searchModeLens.addEventListener('change', (e) => {
    if (e.target.checked) handleSearchModeChange('lens');
  });

  searchModeAi.addEventListener('change', (e) => {
    if (e.target.checked) handleSearchModeChange('ai');
  });
}

const handleSearchModeChange = (mode) => {
  currentSearchMode = mode;
  localStorage.setItem('searchMode', mode);
  ipcRenderer.invoke('settings:set-search-mode', mode);
  console.log('Search Mode changed to:', mode);
  // Add visual feedback or log
  console.log(`[UI] Syncing search mode ${mode} to Main.`);
};

searchModeAsk.addEventListener('change', (e) => {
  if (e.target.checked) handleSearchModeChange('ask');
});

searchModeLens.addEventListener('change', (e) => {
  if (e.target.checked) handleSearchModeChange('lens');
});

searchModeAi.addEventListener('change', (e) => {
  if (e.target.checked) handleSearchModeChange('ai');
});

/* 綁定事件監聽器 */
sendButton.addEventListener('click', () => {
  sendMessage().catch((error) => console.error('Failed to send message', error));
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage().catch((error) => console.error('Failed to send message', error));
  }
});

fileUploadButton.addEventListener('click', () => fileUploadInput.click());
fileUploadInput.addEventListener('change', (event) => {
  handleFileUpload(event).catch((error) => console.error('Failed to handle file upload', error));
});

textInput.addEventListener('input', () => {
  autoResizeTextarea();
  updateCharCount();
});

historyButton.addEventListener('click', () => {
  historyButton.classList.toggle('is-open');
  historyList.classList.toggle('is-open');
});

chatButton.addEventListener('click', () => setActivePage('page-chat'));
settingsButton.addEventListener('click', () => setActivePage('page-settings'));
helpButton.addEventListener('click', () => setActivePage('page-help'));

if (clearHistoryButton) {
  clearHistoryButton.addEventListener('click', () => {
    clearAllHistory().catch((error) => console.error('Failed to clear history', error));
  });
}

if (themeToggle) {
  themeToggle.checked = document.documentElement.classList.contains('dark-mode');
  themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light');
    }
  });
}

// LLM 提供者選擇
if (llmProviderAuto && llmProviderGemini && llmProviderOpenAI) {
  // 初始化選中狀態
  const initLlmProvider = () => {
    if (currentLlmProvider === 'gemini') {
      llmProviderGemini.checked = true;
    } else if (currentLlmProvider === 'openai') {
      llmProviderOpenAI.checked = true;
    } else {
      llmProviderAuto.checked = true;
      currentLlmProvider = 'auto';
    }
  };

  initLlmProvider();

  const handleLlmProviderChange = (provider) => {
    currentLlmProvider = provider;
    localStorage.setItem('llmProvider', provider);
    console.log('LLM Provider changed to:', provider);
  };

  // 使用 change 事件監聽器
  llmProviderAuto.addEventListener('change', (e) => {
    if (e.target.checked) {
      handleLlmProviderChange('auto');
    }
  });

  llmProviderGemini.addEventListener('change', (e) => {
    if (e.target.checked) {
      handleLlmProviderChange('gemini');
    }
  });

  llmProviderOpenAI.addEventListener('change', (e) => {
    if (e.target.checked) {
      handleLlmProviderChange('openai');
    }
  });

  // 確保點擊整個 label 區域都能觸發 radio
  const toggleOptions = document.querySelectorAll('.settings-toggle-option');
  toggleOptions.forEach((option) => {
    option.addEventListener('click', (e) => {
      // 如果點擊的不是 input 本身，確保觸發 input
      const input = option.querySelector('.toggle-switch__input');
      if (input && e.target !== input) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

// API Key 輸入綁定（不自動儲存，等待使用者點擊儲存按鈕）
if (geminiApiKeyInput) {
  if (currentGeminiApiKey) {
    geminiApiKeyInput.value = currentGeminiApiKey;
  }
}

if (openaiApiKeyInput) {
  if (currentOpenAIApiKey) {
    openaiApiKeyInput.value = currentOpenAIApiKey;
  }
}

// 儲存按鈕功能
if (saveApiKeysButton) {
  saveApiKeysButton.addEventListener('click', () => {
    // 儲存 API Keys
    if (geminiApiKeyInput) {
      currentGeminiApiKey = geminiApiKeyInput.value.trim();
      localStorage.setItem('geminiApiKey', currentGeminiApiKey);
    }
    if (openaiApiKeyInput) {
      currentOpenAIApiKey = openaiApiKeyInput.value.trim();
      localStorage.setItem('openaiApiKey', currentOpenAIApiKey);
    }

    // 顯示儲存成功提示
    const originalText = saveApiKeysButton.textContent;
    saveApiKeysButton.textContent = '已儲存';
    saveApiKeysButton.style.opacity = '0.8';
    setTimeout(() => {
      saveApiKeysButton.textContent = originalText;
      saveApiKeysButton.style.opacity = '1';
    }, 1500);

    // Sync to main process
    syncApiKeysToMain();
  });
}

/* 應用程式初始化 */
bootstrapHistory().catch((error) => console.error('Failed to initialise history', error));

// Sync keys on startup
syncApiKeysToMain();

function syncApiKeysToMain() {
  ipcRenderer.send('settings:update-api-keys', {
    gemini: currentGeminiApiKey || null,
    openai: currentOpenAIApiKey || null
  });
}

/* 核心功能函式 - 會話與歷史紀錄 */
function createHistoryItem(session) {
  const item = document.createElement('a');
  item.href = '#';
  item.classList.add('history-item');
  item.dataset.sessionId = String(session.id);

  const title = document.createElement('span');
  title.classList.add('history-item__title');
  title.textContent = session.title;

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.classList.add('history-item__close');
  closeButton.setAttribute('aria-label', '刪除對話');
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteSession(session.id);
  });

  item.addEventListener('click', (event) => {
    event.preventDefault();
    setActiveSession(session).catch((error) => console.error('Failed to switch session', error));
  });

  item.appendChild(title);
  item.appendChild(closeButton);
  return item;
}

async function bootstrapHistory() {
  const sessions = await refreshSessionList(undefined, { normalize: true });

  if (sessions.length === 0) {
    await createAndActivateSession();
  } else {
    const latestSession = sessions[0];
    const messageCount = Number(latestSession?.message_count ?? latestSession?.messageCount ?? 0);
    if (messageCount === 0) {
      await setActiveSession(latestSession);
    } else {
      await createAndActivateSession();
    }
  }

  updateCharCount();
  autoResizeTextarea();
  loadSettingsInfo();
  showGreetingIfEmpty();
}

async function refreshSessionList(activeSessionId, options = {}) {
  const { normalize = false } = options;
  try {
    const sessions = normalize
      ? await ipcRenderer.invoke('history:normalize')
      : await ipcRenderer.invoke('history:get-sessions');
    historyList.innerHTML = '';
    sessions.forEach((session) => {
      const item = createHistoryItem(session);
      if (session.id === activeSessionId) {
        item.classList.add('is-active');
      }
      historyList.appendChild(item);
    });
    return sessions;
  } catch (error) {
    console.error('Unable to load history sessions', error);
    return [];
  }
}

async function ensureSession() {
  if (currentSession) {
    return currentSession;
  }
  return createAndActivateSession();
}

async function setActiveSession(session) {
  if (!session || (currentSession && currentSession.id === session.id)) {
    return;
  }
  currentSession = session;
  await loadMessages(session.id);
  await refreshSessionList(session.id);
  historyButton.classList.remove('is-open');
  historyList.classList.remove('is-open');
  setActivePage('page-chat');
}

async function loadMessages(sessionId) {
  try {
    const messages = await ipcRenderer.invoke('history:get-messages', sessionId);
    chatDisplay.innerHTML = '';
    messages.forEach((message) => {
      const payload = message?.payload || {};
      const text = payload?.content || '';
      const type = payload?.type || 'text';
      const downloadInfo = payload?.download;

      if (!text && type !== 'download') return;
      appendMessage(text, message.role, type, {
        filePath: downloadInfo?.path,
        fileName: downloadInfo?.filename
      });
    });
    showGreetingIfEmpty();
  } catch (error) {
    console.error('Unable to load messages', error);
  }
}

/* 核心功能函式 - 訊息與檔案處理 */
async function sendMessage() {
  const messageText = textInput.value.trim();
  if (messageText === '') return;

  const session = await ensureSession();

  appendMessage(messageText, 'user', 'text');

  textInput.value = '';
  autoResizeTextarea();
  updateCharCount();

  persistMessage(session.id, 'user', messageText);

  if (thinkingBubbleElement) {
    thinkingBubbleElement.remove();
  }
  thinkingBubbleElement = appendMessage('', 'ai', 'thinking');

  ipcRenderer.send('message-to-agent', {
    type: 'text',
    content: messageText,
    session: getSessionEnvelope(session),
    llmProvider: currentLlmProvider,
    apiKeys: {
      gemini: currentGeminiApiKey || null,
      openai: currentOpenAIApiKey || null
    }
  });

  setActivePage('page-chat');
}

async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  const notice = `Selected file: ${file.name}`;
  const session = await ensureSession();
  appendMessage(notice, 'user', 'text');

  persistMessage(session.id, 'user', notice);

  if (thinkingBubbleElement) {
    thinkingBubbleElement.remove();
  }
  thinkingBubbleElement = appendMessage('', 'ai', 'thinking');

  ipcRenderer.send('message-to-agent', {
    type: 'file',
    path: file.path,
    session: getSessionEnvelope(session),
    llmProvider: currentLlmProvider,
    apiKeys: {
      gemini: currentGeminiApiKey || null,
      openai: currentOpenAIApiKey || null
    }
  });
  fileUploadInput.value = '';
  setActivePage('page-chat');
}

/**
 * 在聊天視窗中追加一條訊息。
 * (已修改：支援 Download 按鈕與 Copy 按鈕平行)
 */
function appendMessage(text, sender, messageType = 'text', options = {}) {
  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group', `message-group--${sender}`);

  const messageAvatar = document.createElement('div');
  messageAvatar.classList.add('message-avatar');
  messageAvatar.textContent = sender === 'ai' ? 'AI' : 'You';

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');

  const messageBubble = document.createElement('div');
  messageBubble.classList.add('message-bubble');

  // Copy 按鈕容器
  const messageActions = document.createElement('div');
  messageActions.classList.add('message-actions');

  const copyButton = document.createElement('button');
  copyButton.classList.add('action-button');

  // [修改點 1] 將圖示改為文字
  copyButton.textContent = '複製';
  // copyButton.setAttribute('title', '複製內容'); // 文字按鈕本身就很直觀，這行可留可不留

  copyButton.addEventListener('click', () => {
    const textToCopy = messageType === 'thinking' ? '' : text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      // [修改點 2] 複製後的回饋文字
      copyButton.textContent = '已複製';

      // 這裡可以選擇不變色，或者稍微變深一點點表示狀態
      // copyButton.style.color = 'var(--color-text)'; 

      setTimeout(() => {
        // [修改點 3] 恢復原狀
        copyButton.textContent = '複製';
        // copyButton.style.color = ''; 
      }, 2000);
    });
  });

  // 將按鈕放入容器
  messageActions.appendChild(copyButton);


  if (messageType === 'thinking') {
    messageBubble.classList.add('message-bubble--thinking');
    messageBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    // 思考中不顯示 Copy
  } else if (messageType === 'code') {
    messageBubble.classList.add('message-bubble--code');
    messageBubble.textContent = text;
    // Copy 按鈕移至 bubble 外
  } else if (messageType === 'download') {
    messageBubble.classList.add('message-bubble--download');

    const description = document.createElement('div');
    description.textContent = text || '輸出已準備好，點擊下載 zip。';
    messageBubble.appendChild(description);

    // 創建下載按鈕 (Pill Style)
    const downloadButton = document.createElement('button');
    downloadButton.classList.add('action-button', 'action-button--pill');
    // 使用更好的 Icon + 文字
    downloadButton.innerHTML = '下載';
    downloadButton.addEventListener('click', async () => {
      if (!options.filePath) return;

      const originalContent = downloadButton.innerHTML;
      downloadButton.innerHTML = '⏳ 處理中...';
      downloadButton.disabled = true;

      try {
        const result = await ipcRenderer.invoke('download:save-zip', {
          zipPath: options.filePath,
          defaultName: options.fileName || undefined
        });
        if (result?.ok) {
          downloadButton.innerHTML = '✅ 已下載';
        } else if (result?.cancelled) {
          downloadButton.innerHTML = '❌ 已取消';
        } else {
          downloadButton.innerHTML = '⚠️ 失敗';
        }
      } catch (err) {
        console.error('Failed to download zip', err);
        downloadButton.innerHTML = '⚠️ 錯誤';
      }

      setTimeout(() => {
        downloadButton.innerHTML = originalContent;
        downloadButton.disabled = false;
      }, 2000);
    });

    // 將下載按鈕加入到 messageActions (與 Copy 平行)
    messageActions.insertBefore(downloadButton, copyButton);

  } else {
    // 一般文字
    messageBubble.textContent = text;
  }

  messageContent.appendChild(messageBubble);

  // 將按鈕區塊加入到 messageContent (在 Bubble 之後)
  if (messageType !== 'thinking') {
    messageContent.appendChild(messageActions);
  }

  messageGroup.appendChild(messageAvatar);
  messageGroup.appendChild(messageContent);
  chatDisplay.appendChild(messageGroup);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;

  return messageGroup;
}

/* IPC 監聽器 */
ipcRenderer.on('message-from-agent', (_event, response) => {
  if (thinkingBubbleElement) {
    thinkingBubbleElement.remove();
    thinkingBubbleElement = null;
  }

  const type = response?.type || 'text';
  const content = typeof response === 'string' ? response : response?.content || '';
  const downloadInfo = response?.download;

  if (response?.type === 'error') {
    appendMessage(`Error: ${content}`, 'ai', 'text');
    return;
  }

  const messageType = type === 'download' ? 'download' : type;

  if (!content && messageType !== 'thinking' && messageType !== 'download') return;

  appendMessage(content, 'ai', messageType, {
    filePath: downloadInfo?.path,
    fileName: downloadInfo?.filename
  });

  if (!currentSession) {
    console.warn('AI response received without an active session; skipping persistence.');
    return;
  }

  persistMessage(currentSession.id, 'ai', content, {
    type: messageType,
    download: downloadInfo
  });
});

/* 設定頁面功能 */
function loadSettingsInfo() {
  if (dataPathDisplay) {
    ipcRenderer.invoke('settings:get-app-data-path')
      .then((path) => {
        dataPathDisplay.value = path;
      })
      .catch((error) => {
        console.error('Failed to get data path', error);
        dataPathDisplay.value = '無法載入路徑';
      });
  }
}

async function clearAllHistory() {
  try {
    const result = await ipcRenderer.invoke('history:clear-all');
    if (result.ok) {
      console.log('History cleared successfully.');
      await bootstrapHistory();
      const clearBtn = document.getElementById('clear-history-button');
      if (clearBtn) {
        const originalText = clearBtn.textContent;
        clearBtn.textContent = '已清除所有紀錄';
        clearBtn.style.opacity = '0.7';
        clearBtn.disabled = true;

        setTimeout(() => {
          clearBtn.textContent = originalText;
          clearBtn.style.opacity = '1';
          clearBtn.disabled = false;
        }, 2000);
      }
    } else if (result.cancelled) {
      console.log('History clear operation was cancelled.');
    } else {
      console.error('Failed to clear history:', result.error);
    }
  } catch (error) {
    console.error('Error invoking history:clear-all:', error);
  }
}

/* UI 輔助函式 */
function autoResizeTextarea() {
  textInput.style.height = 'auto';
  textInput.style.height = `${textInput.scrollHeight}px`;
}

function updateCharCount() {
  const currentLength = textInput.value.length;
  charCounter.textContent = `${currentLength}/2000`;
}

function setActivePage(pageIdToShow) {
  pageChat.classList.remove('is-active');
  pageSettings.classList.remove('is-active');
  pageHelp.classList.remove('is-active');

  chatButton.classList.remove('is-active');
  settingsButton.classList.remove('is-active');
  helpButton.classList.remove('is-active');

  if (pageIdToShow === 'page-chat') {
    pageChat.classList.add('is-active');
    chatButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-settings') {
    pageSettings.classList.add('is-active');
    settingsButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-help') {
    pageHelp.classList.add('is-active');
    helpButton.classList.add('is-active');
  }
}

function getSessionEnvelope(session) {
  if (!session) return null;
  return {
    id: session.id,
    sequence: session.sequence,
    title: session.title
  };
}

function persistMessage(sessionId, role, content, options = {}) {
  const payload = {
    role,
    content,
    type: options.type || 'text',
  };

  if (options.download) {
    payload.download = options.download;
  }

  ipcRenderer
    .invoke('history:add-message', { sessionId, role, content, payload })
    .catch((error) => console.error('Unable to persist message', error));
}

async function createAndActivateSession() {
  const session = await ipcRenderer.invoke('history:create-session');
  await setActiveSession(session);
  return session;
}

async function deleteSession(sessionId) {
  try {
    const result = await ipcRenderer.invoke('history:delete-session', sessionId);
    if (!result?.ok) {
      console.error('Failed to delete session:', result?.error || 'unknown error');
      return;
    }
    if (currentSession && currentSession.id === sessionId) {
      currentSession = null;
    }
    const sessions = await refreshSessionList(currentSession?.id, { normalize: true });
    if (sessions.length > 0) {
      await setActiveSession(sessions[0]);
    } else {
      await createAndActivateSession();
    }
  } catch (error) {
    console.error('Unable to delete session', error);
  }
}

function showGreetingIfEmpty() {
  if (!chatDisplay || chatDisplay.children.length > 0) return;
  const greeting = "您好，我是您的開發助理。請問今天有什麼可以協助您的嗎？";
  appendMessage(greeting, 'ai', 'text');
}

ipcRenderer.on('agent-log', (_event, logMessage) => {
  if (!thinkingBubbleElement) return;

  // 1. 尋找或建立 Log Container
  // 由於 appendMessage 返回的是 messageGroup，我們需要在 messageGroup 裡面找
  // 或者直接把 Log Container 加在 messageGroup 的最後面 (bubble 下方)

  let logDetails = thinkingBubbleElement.querySelector('.log-details');
  if (!logDetails) {
    // 建立 Log 區塊結構
    // <div class="log-container">
    //   <details class="log-details">
    //     <summary class="log-summary">查看執行細節 (Process Logs)</summary>
    //     <div class="log-content"></div>
    //   </details>
    // </div>

    const logContainer = document.createElement('div');
    logContainer.classList.add('log-container');

    logDetails = document.createElement('details');
    logDetails.classList.add('log-details');

    const summary = document.createElement('summary');
    summary.classList.add('log-summary');
    summary.textContent = '查看執行細節 (Process Logs)';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('log-content');

    logDetails.appendChild(summary);
    logDetails.appendChild(contentDiv);
    logContainer.appendChild(logDetails);

    // 將 Log Container 加到 Message Content 中 (Bubble 下方)
    const messageContent = thinkingBubbleElement.querySelector('.message-content');
    if (messageContent) {
      messageContent.appendChild(logContainer);
    }
  }

  // 2. 追加 Log（美化版）
  const contentDiv = logDetails.querySelector('.log-content');
  if (contentDiv) {
    // 解析日誌訊息並添加樣式
    const formattedLog = formatAgentLog(logMessage);

    // 如果返回 null，表示這個日誌不需要顯示
    if (!formattedLog) return;

    const entry = document.createElement('div');
    entry.innerHTML = formattedLog.html;
    entry.className = `log-entry ${formattedLog.className}`;

    contentDiv.appendChild(entry);

    // 自動捲動到底部
    contentDiv.scrollTop = contentDiv.scrollHeight;
  }
});

// 美化 Agent Log 格式 - 簡化版（只顯示主要Agent狀態）
function formatAgentLog(message) {
  let className = '';
  let html = message;
  let icon = '';

  // 檢測主要 Agent 階段
  if (message.includes('Architect') && (message.includes('starting') || message.includes('Running') || message.includes('initialized'))) {
    icon = '📐';
    className = 'log-entry--architect log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Architect Agent</strong> 執行中...</span>`;
  }
  else if (message.includes('Verifier') && (message.includes('starting') || message.includes('Running') || message.includes('test-plan'))) {
    icon = '✓';
    className = 'log-entry--verifier log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Verifier Agent</strong> 執行中...</span>`;
  }
  else if (message.includes('Tester') && (message.includes('starting') || message.includes('Running') || message.includes('Jest'))) {
    icon = '🧪';
    className = 'log-entry--tester log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Tester Agent</strong> 執行中...</span>`;
  }
  // Coder Agent 相關
  else if (message.includes('Phase 0')) {
    icon = '⚙️';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 準備配置...</span>`;
  }
  else if (message.includes('Phase 1')) {
    icon = '🔨';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 生成專案骨架...</span>`;
  }
  else if (message.includes('Phase 2')) {
    icon = '💻';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 生成檔案內容...</span>`;
  }
  else if (message.includes('Phase 3')) {
    icon = '📦';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 組裝專案...</span>`;
  }
  // 顯示生成進度（Layer）
  else if (message.includes('Layer') && message.includes('processing')) {
    const layerMatch = message.match(/Layer (\d+)\/(\d+)/);
    if (layerMatch) {
      icon = '⏳';
      className = 'log-entry--progress';
      html = `<span class="log-icon">${icon}</span><span class="log-text">生成進度: ${layerMatch[1]}/${layerMatch[2]}</span>`;
    } else {
      return null; // 不顯示
    }
  }
  // 完成訊息
  else if (message.includes('completed') || message.includes('Completed')) {
    icon = '✅';
    className = 'log-entry--success';
    html = `<span class="log-icon">${icon}</span><span class="log-text">生成完成</span>`;
  }
  // 其他訊息一律過濾
  else {
    return null; // 不顯示細節日誌
  }

  return { html, className };
}

function formatAgentLog(message) {
  let className = '';
  let html = message;
  let icon = '';

  //檢測 Phase
  if (message.includes('Phase 0')) {
    icon = '⚙️';
    className = 'log-entry--phase';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Phase 0:</strong> 生成配置檔案</span>`;
  } else if (message.includes('Phase 1')) {
    icon = '📐';
    className = 'log-entry--phase';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Phase 1:</strong> 生成專案骨架</span>`;
  } else if (message.includes('Phase 2')) {
    icon = '🔨';
    className = 'log-entry--phase';
    html = `<span class="log-text"><strong>Phase 2:</strong> 生成檔案細節</span>`;
  } else if (message.includes('Phase 3')) {
    icon = '📦';
    className = 'log-entry--phase';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Phase 3:</strong> 組裝結果</span>`;
  }
  // 檢測 Layer 處理
  else if (message.includes('Layer') && message.includes('processing')) {
    icon = '🔄';
    className = 'log-entry--layer';
    const layerMatch = message.match(/Layer (\d+)\/(\d+)/);
    if (layerMatch) {
      html = `<span class="log-icon">${icon}</span><span class="log-text">處理第 ${layerMatch[1]}/${layerMatch[2]} 層...</span>`;
    }
  }
  // 檢測檔案生成成功
  else if (message.includes('✅ Generated') || message.includes('Generated ')) {
    icon = '✅';
    className = 'log-entry--success';
    const fileMatch = message.match(/Generated\s+(.+)/);
    if (fileMatch) {
      let fileName = fileMatch[1].trim();
      // 獲取檔案類型圖標
      let fileIcon = '📄';
      if (fileName.includes('.html')) fileIcon = '🌐';
      else if (fileName.includes('.css')) fileIcon = '🎨';
      else if (fileName.includes('.js')) fileIcon = '⚡';
      else if (fileName.includes('.json')) fileIcon = '📋';
      else if (fileName.includes('.py')) fileIcon = '🐍';

      html = `<span class="log-icon">${icon}</span><span class="log-file-icon">${fileIcon}</span><span class="log-text">${fileName}</span>`;
    }
  }
  // 檢測 Agent 類型
  else if (message.includes('[Generator]')) {
    icon = '🤖';
    className = 'log-entry--agent';
    html = `<span class="log-icon">${icon}</span><span class="log-text">${message.replace('[Generator]', '<strong>Generator:</strong>')}</span>`;
  }
  else if (message.includes('[Coordinator]')) {
    icon = '🎯';
    className = 'log-entry--coordinator';
    html = `<span class="log-icon">${icon}</span><span class="log-text">${message.replace('[Coordinator]', '<strong>Coordinator:</strong>')}</span>`;
  }
  // 檢測 Architect/Verifier/Tester
  else if (message.includes('Architect')) {
    icon = '📐';
    className = 'log-entry--architect';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Architect Agent:</strong> 正在設計專案架構...</span>`;
  }
  else if (message.includes('Verifier') || message.includes('test-plan')) {
    icon = '✓';
    className = 'log-entry--verifier';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Verifier Agent:</strong> 生成測試計劃...</span>`;
  }
  else if (message.includes('Tester') || message.includes('Test')) {
    icon = '🧪';
    className = 'log-entry--tester';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Tester Agent:</strong> 執行測試...</span>`;
  }
  // 檢測配置生成
  else if (message.includes('Config files') || message.includes('package.json')) {
    icon = '⚙️';
    className = 'log-entry--config';
    html = `<span class="log-icon">${icon}</span><span class="log-text">${message}</span>`;
  }
  // 檢測 Contracts
  else if (message.includes('Contracts')) {
    icon = '📋';
    className = 'log-entry--contracts';
    html = `<span class="log-icon">${icon}</span><span class="log-text">${message}</span>`;
  }
  // 警告訊息
  else if (message.includes('⚠️') || message.includes('Warning')) {
    className = 'log-entry--warning';
  }
  //一般訊息
  else {
    className = 'log-entry--info';
    html = `<span class="log-text">${message}</span>`;
  }

  return { html, className };
}