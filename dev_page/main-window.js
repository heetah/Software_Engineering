/**
 * @file 渲染器進程核心腳本 (main-window.js)
 * (最終整合版：Copy 按鈕內嵌、無亮部陰影樣式適配)
 */

// Initialize theme BEFORE anything else to prevent flash
const savedTheme = localStorage.getItem('theme');
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark-mode');
}

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

// Library page elements
const libraryButton = document.getElementById('library-button');
const pageLibrary = document.getElementById('page-library');
const libraryContainer = document.getElementById('library-container');
const projectCount = document.getElementById('project-count');
const sortProjectsBtn = document.getElementById('sort-projects-btn');
const sortLabel = document.getElementById('sort-label');
const sortIcon = document.getElementById('sort-icon');

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

// 側邊欄的新按鈕
const tutorialTriggerBtn = document.getElementById('tutorial-btn'); // 新手教學元素
const refreshSessionBtn = document.getElementById('refresh-session-btn'); // 側邊欄的刷新按鈕

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
libraryButton.addEventListener('click', () => {
  setActivePage('page-library');
  loadProjectLibrary();
});

// Sort button
if (sortProjectsBtn) {
  sortProjectsBtn.addEventListener('click', toggleProjectSort);
}

if (clearHistoryButton) {
  clearHistoryButton.addEventListener('click', () => {
    clearAllHistory().catch((error) => console.error('Failed to clear history', error));
  });
}

// Refresh session button (新對話按鈕)
if (refreshSessionBtn) {
  refreshSessionBtn.addEventListener('click', async () => {
    try {
      await createAndActivateSession();
      chatDisplay.innerHTML = '';
      showGreetingIfEmpty();
    } catch (error) {
      console.error('Failed to create new session', error);
    }
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
      downloadButton.innerHTML = '⊙ 處理中...';
      downloadButton.disabled = true;

      try {
        const result = await ipcRenderer.invoke('download:save-zip', {
          zipPath: options.filePath,
          defaultName: options.fileName || undefined
        });
        if (result?.ok) {
          downloadButton.innerHTML = '✓ 已下載';
        } else if (result?.cancelled) {
          downloadButton.innerHTML = '❌ 已取消';
        } else {
          downloadButton.innerHTML = '✗ 失敗';
        }
      } catch (err) {
        console.error('Failed to download zip', err);
        downloadButton.innerHTML = '✗ 錯誤';
      }

      setTimeout(() => {
        downloadButton.innerHTML = originalContent;
        downloadButton.disabled = false;
      }, 2000);
    });

    // 將下載按鈕加入到 messageActions (與 Copy 平行)
    messageActions.insertBefore(downloadButton, copyButton);

  } else {
    // 一般文字 - 處理換行符號
    // 先轉義 HTML 以防止 XSS，然後將 \n 轉換為 <br>
    const escapedText = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
      .replace(/\n/g, '<br>');
    messageBubble.innerHTML = escapedText;
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
  pageLibrary.classList.remove('is-active');

  chatButton.classList.remove('is-active');
  settingsButton.classList.remove('is-active');
  helpButton.classList.remove('is-active');
  libraryButton.classList.remove('is-active');

  if (pageIdToShow === 'page-chat') {
    pageChat.classList.add('is-active');
    chatButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-settings') {
    pageSettings.classList.add('is-active');
    settingsButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-help') {
    pageHelp.classList.add('is-active');
    helpButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-library') {
    pageLibrary.classList.add('is-active');
    libraryButton.classList.add('is-active');
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

/* Library Page Functions */
let currentProjects = [];
let sortOrder = 'newest'; // 'newest' or 'oldest'

async function loadProjectLibrary() {
  try {
    const projects = await ipcRenderer.invoke('library:get-projects');
    currentProjects = projects || [];
    renderProjectLibrary();
  } catch (error) {
    console.error('Failed to load project library:', error);
    showLibraryError();
  }
}

function renderProjectLibrary() {
  if (!libraryContainer) return;

  libraryContainer.innerHTML = '';

  // Update project count
  if (projectCount) {
    const count = currentProjects.length;
    projectCount.textContent = count === 0 ? '尚無專案' :
      count === 1 ? '共 1 個專案' : `共 ${count} 個專案`;
  }

  // Sort projects
  const sortedProjects = [...currentProjects].sort((a, b) => {
    if (sortOrder === 'newest') {
      return b.timestamp - a.timestamp;
    } else {
      return a.timestamp - b.timestamp;
    }
  });

  // Show empty state if no projects
  if (sortedProjects.length === 0) {
    showEmptyLibrary();
    return;
  }

  // Render project cards
  sortedProjects.forEach(project => {
    const card = createProjectCard(project);
    libraryContainer.appendChild(card);
  });
}

function createProjectCard(project) {
  const card = document.createElement('div');
  card.classList.add('project-card');

  // Determine icon based on project type
  const icon = getProjectIcon(project.name);

  // Format date
  const date = new Date(project.timestamp);
  const formattedDate = formatDate(date);

  card.innerHTML = `
    <div class="project-card__thumbnail">
      ${icon}
    </div>
    <div class="project-card__info">
      <h3 class="project-card__title">${escapeHtml(project.name)}</h3>
      <div class="project-card__meta">
        <span class="project-card__date">
          <span>◷</span>
          <span>${formattedDate}</span>
        </span>
      </div>
      <p class="project-card__description">
        ${project.description || '專案檔案已準備完成'}
      </p>
      <div class="project-card__actions">
        <button class="project-card__btn" data-action="open-folder">
          開啟資料夾
        </button>
        <button class="project-card__btn project-card__btn--primary" data-action="preview">
          預覽
        </button>
      </div>
    </div>
  `;

  // Add event listeners to buttons
  const buttons = card.querySelectorAll('.project-card__btn');
  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = button.getAttribute('data-action');
      if (action === 'open-folder') {
        openProjectFolder(project);
      } else if (action === 'preview') {
        previewProject(project);
      }
    });
  });

  return card;
}

function getProjectIcon(projectName) {
  const name = projectName.toLowerCase();
  if (name.includes('calculator') || name.includes('計算機')) return '▢';
  if (name.includes('todo') || name.includes('待辦')) return '▢';
  if (name.includes('chat') || name.includes('聊天')) return '▢';
  if (name.includes('game') || name.includes('遊戲')) return '▢';
  if (name.includes('shop') || name.includes('商店') || name.includes('點餐')) return '▢';
  if (name.includes('weather') || name.includes('天氣')) return '▢';
  if (name.includes('music') || name.includes('音樂')) return '▢';
  return '▢';
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 7) return `${days} 天前`;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function toggleProjectSort() {
  sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';

  if (sortLabel) {
    sortLabel.textContent = sortOrder === 'newest' ? '最新 → 最舊' : '最舊 → 最新';
  }

  if (sortIcon) {
    sortIcon.textContent = sortOrder === 'newest' ? '🕒' : '⏰';
  }

  renderProjectLibrary();
}

function openProjectFolder(project) {
  ipcRenderer.invoke('library:open-project', project.path)
    .catch(error => console.error('Failed to open project folder:', error));
}

function previewProject(project) {
  ipcRenderer.invoke('library:preview-project', project.path)
    .catch(error => console.error('Failed to preview project:', error));
}

function showEmptyLibrary() {
  libraryContainer.innerHTML = `
    <div class="library-empty">
      <div class="library-empty__icon">▢</div>
      <div class="library-empty__text">還沒有生成任何專案</div>
      <div class="library-empty__hint">開始對話，讓 AI 為您生成第一個專案吧！</div>
    </div>
  `;
}

function showLibraryError() {
  libraryContainer.innerHTML = `
    <div class="library-empty">
      <div class="library-empty__icon">▲</div>
      <div class="library-empty__text">載入專案失敗</div>
      <div class="library-empty__hint">請稍後再試</div>
    </div>
  `;
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
    const logContainer = document.createElement('div');
    logContainer.classList.add('log-container');

    logDetails = document.createElement('details');
    logDetails.classList.add('log-details');

    const summary = document.createElement('summary');
    summary.classList.add('log-summary');
    summary.textContent = 'Process Logs';

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

  // === 初始化階段 ===
  if (message.includes('Coordinator Bridge') && message.includes('Received user input')) {
    icon = '◆';
    className = 'log-entry--init';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>系統初始化</strong> 接收用戶需求...</span>`;
  }
  else if (message.includes('API Provider Manager') || message.includes('Configuration tips')) {
    icon = '⚙';
    className = 'log-entry--config';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>配置載入</strong> 初始化 API...</span>`;
  }
  else if (message.includes('provider registered')) {
    const provider = message.includes('OpenAI') ? 'OpenAI' : 'Gemini';
    const type = message.includes('primary') ? '主要' : '備用';
    icon = '◉';
    className = 'log-entry--config';
    html = `<span class="log-icon">${icon}</span><span class="log-text">註冊 ${provider} (${type})</span>`;
  }
  // === Architect Agent ===
  else if (message.includes('Architect') && (message.includes('starting') || message.includes('Running') || message.includes('initialized'))) {
    icon = '▲';
    className = 'log-entry--architect log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Architect Agent</strong> 分析需求並生成架構...</span>`;
  }
  else if (message.includes('Architect') && message.includes('completed')) {
    icon = '●';
    className = 'log-entry--architect log-entry--success';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Architect Agent</strong> 架構完成</span>`;
  }
  // === Verifier Agent ===
  else if (message.includes('Verifier') && (message.includes('starting') || message.includes('Running'))) {
    icon = '✓';
    className = 'log-entry--verifier log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Verifier Agent</strong> 生成測試計劃...</span>`;
  }
  else if (message.includes('Verifier') && message.includes('completed')) {
    icon = '●';
    className = 'log-entry--verifier log-entry--success';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Verifier Agent</strong> 測試計劃完成</span>`;
  }
  else if (message.includes('test-plan.json')) {
    icon = '▢';
    className = 'log-entry--file';
    html = `<span class="log-icon">${icon}</span><span class="log-text">已生成 test-plan.json</span>`;
  }
  // === Tester Agent ===
  else if (message.includes('Tester') && (message.includes('starting') || message.includes('Running'))) {
    icon = '◉';
    className = 'log-entry--tester log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Tester Agent</strong> 生成並執行測試...</span>`;
  }
  else if (message.includes('Tester') && message.includes('completed')) {
    icon = '●';
    className = 'log-entry--tester log-entry--success';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Tester Agent</strong> 測試完成</span>`;
  }
  else if (message.includes('Jest')) {
    icon = '◉';
    className = 'log-entry--tester';
    html = `<span class="log-icon">${icon}</span><span class="log-text">執行 Jest 測試...</span>`;
  }
  else if (message.includes('test-report.json')) {
    icon = '▢';
    className = 'log-entry--file';
    html = `<span class="log-icon">${icon}</span><span class="log-text">已生成 test-report.json</span>`;
  }
  // Coder Agent 相關
  else if (message.includes('Phase 0')) {
    icon = '⚙';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 準備配置...</span>`;
  }
  else if (message.includes('Phase 1')) {
    icon = '▣';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 生成專案骨架...</span>`;
  }
  else if (message.includes('Phase 2')) {
    icon = '▣';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 生成檔案內容...</span>`;
  }
  else if (message.includes('Phase 3')) {
    icon = '▣';
    className = 'log-entry--coder log-entry--active';
    html = `<span class="log-icon">${icon}</span><span class="log-text"><strong>Coder Agent</strong> 組裝專案...</span>`;
  }
  // 顯示生成進度（Layer）
  else if (message.includes('Layer') && message.includes('processing')) {
    const layerMatch = message.match(/Layer (\d+)\/(\d+)/);
    if (layerMatch) {
      icon = '⊙';
      className = 'log-entry--progress';
      html = `<span class="log-icon">${icon}</span><span class="log-text">生成進度: ${layerMatch[1]}/${layerMatch[2]}</span>`;
    } else {
      return null; // 不顯示
    }
  }
  // 完成訊息
  else if (message.includes('completed') || message.includes('Completed')) {
    icon = '✓';
    className = 'log-entry--success';
    html = `<span class="log-icon">${icon}</span><span class="log-text">生成完成</span>`;
  }
  // 其他訊息一律過濾
  else {
    return null; // 不顯示細節日誌
  }

  return { html, className };
}

/* ====================================================================
 * 6. 新手教學模組 (Onboarding System) - 多頁面導覽版
 * ====================================================================
 */

// 定義教學步驟
const tutorialSteps = [
  {
    // Step 1: 歡迎
    pageId: 'page-chat',
    targetId: null,
    text: "<strong style='font-size: 18px;'>歡迎使用 AI Copilot</strong><br>我是您的全棧開發助理。讓我花一點時間，帶您熟悉這個強大的開發環境。",
    placement: 'center'
  },
  {
    // Step 2: 頂部捷徑
    pageId: 'page-chat',
    targetId: 'sidebar-header',
    text: "<strong style='font-size: 18px;'>快速捷徑</strong><br>這裡有兩個實用的小按鈕：<br>⚡ <strong>重看教學</strong>：忘記功能時隨時點擊複習。<br>✦ <strong>新對話</strong>：一鍵清除當前畫面，開始全新的專案 (Refresh)。",
    placement: 'right'
  },
  {
    // Step 3: 歷史紀錄
    pageId: 'page-chat',
    targetId: 'history-button',
    text: "<strong style='font-size: 18px;'>歷史紀錄</strong><br>所有的靈感都不會遺失。點擊這裡展開側邊欄清單，您可以隨時回顧過去的對話，或刪除舊的專案紀錄。",
    placement: 'right'
  },
  {
    // Step 4: 設定頁面 - API Key
    pageId: 'page-settings',
    targetId: 'save-api-keys-button',
    text: "<strong style='font-size: 18px;'>核心大腦設定</strong><br>這是最重要的一步！<br>請在 <strong>LLM 選擇</strong>區塊填入 API Key 並儲存。我需要這把鑰匙才能連接 Gemini 或 OpenAI 來為您寫程式。",
    placement: 'top'
  },
  {
    // Step 5: 設定頁面 - 詳細介紹
    pageId: 'page-settings',
    targetId: 'about-app-card',
    text: "<strong style='font-size: 18px;'>控制中心導覽</strong><br>這裡分為四大區塊：<br>1. <strong>顯示</strong>：切換深色模式保護眼睛。<br>2. <strong>資料管理</strong>：備份或清除對話庫。<br>3. <strong>LLM 選擇</strong>：切換不同 AI 模型。<br>4. <strong>關於 App</strong>：查看快捷鍵與隱私聲明。",
    placement: 'center'
  },
  {
    // Step 6: 輸入區
    pageId: 'page-chat',
    targetId: 'input-area-container',
    text: "<strong style='font-size: 18px;'>控制台</strong><br>回到主畫面，這裡是您下達指令的地方。<br>小技巧：試著直接把<strong>錯誤截圖</strong>或<strong>程式碼檔案</strong>拖曳進來，我能直接幫您除錯喔！",
    placement: 'top'
  },
  {
    // Step 7: Circle-to-Search (畫圈搜尋)
    pageId: 'page-chat',
    targetId: null, // 全螢幕功能，顯示在中央
    text: "<strong style='font-size: 18px;'>Circle to Search (畫圈搜尋)</strong><br>這是最強大的隱藏功能！<br>按下 <strong>Cmd/Ctrl + Shift + A</strong>，畫面會凍結，接著用滑鼠<strong>圈選</strong>任何區域，AI 將自動進行以圖搜圖或文字分析。",
    placement: 'center'
  },
  {
    // Step 8: 結束
    pageId: 'page-chat',
    targetId: null,
    text: "<strong style='font-size: 18px;'>準備就緒</strong><br>您已經掌握了所有功能。現在，按下左上角的 ➕ 開啟新對話，試著輸入「幫我寫一個貪食蛇遊戲」吧！",
    placement: 'center',
    isLast: true
  }
];

// 教學模組狀態
let currentStepIndex = 0;
const tutorialOverlay = document.getElementById('tutorial-overlay');
const tutorialSpotlight = document.getElementById('tutorial-spotlight');
const tutorialBubble = document.getElementById('tutorial-bubble');
const tutorialText = document.getElementById('tutorial-text');
const tutorialNextBtn = document.getElementById('tutorial-next-btn');

// 初始化教學
function initTutorial() {
  if (tutorialTriggerBtn) {
    tutorialTriggerBtn.addEventListener('click', () => startTutorial(true));
  }
  if (tutorialNextBtn) {
    tutorialNextBtn.addEventListener('click', nextTutorialStep);
  }

  // Click on overlay background to close (not on bubble)
  if (tutorialOverlay) {
    tutorialOverlay.addEventListener('click', (e) => {
      // Only close if clicking directly on the overlay (not its children)
      if (e.target === tutorialOverlay || e.target === tutorialSpotlight) {
        endTutorial();
      }
    });
  }

  // 鍵盤支援
  document.addEventListener('keydown', (e) => {
    if (!tutorialOverlay?.classList.contains('is-active')) return;
    if (e.key === 'Enter') nextTutorialStep();
    if (e.key === 'Escape') endTutorial();
  });

  // 自動檢查初次使用
  const hasPlayed = localStorage.getItem('hasPlayedTutorial');
  if (!hasPlayed) {
    setTimeout(() => startTutorial(false), 800);
  }
}

// 開始
function startTutorial(isManual = false) {
  currentStepIndex = 0;
  if (tutorialOverlay) tutorialOverlay.classList.add('is-active');
  renderStep(currentStepIndex);
}

// 結束
function endTutorial() {
  if (tutorialOverlay) tutorialOverlay.classList.remove('is-active');
  localStorage.setItem('hasPlayedTutorial', 'true');

  // 重置聚光燈
  setTimeout(() => {
    if (tutorialSpotlight) {
      tutorialSpotlight.style.width = '0';
      tutorialSpotlight.style.height = '0';
      tutorialSpotlight.style.top = '50%';
      tutorialSpotlight.style.left = '50%';
    }
  }, 500);
}

// 下一步
function nextTutorialStep() {
  currentStepIndex++;
  console.log(`Tutorial: Moving to step ${currentStepIndex} of ${tutorialSteps.length}`);
  if (currentStepIndex >= tutorialSteps.length) {
    console.log('Tutorial: Ending tutorial');
    endTutorial();
  } else {
    renderStep(currentStepIndex);
  }
}

// 渲染步驟
function renderStep(index) {
  const step = tutorialSteps[index];
  console.log(`Tutorial: Rendering step ${index}`, step);

  // 定義渲染教學內容的函數
  const renderTutorialContent = () => {
    // Update tutorial text and add close button
    if (tutorialText) {
      tutorialText.innerHTML = step.text;

      // Add close button hint at the bottom of text
      const closeHint = document.createElement('div');
      closeHint.style.marginTop = '12px';
      closeHint.style.fontSize = '12px';
      closeHint.style.color = 'var(--color-text-light)';
      closeHint.innerHTML = '按 <strong>ESC</strong> 可隨時關閉教學';
      tutorialText.appendChild(closeHint);
    }

    if (tutorialNextBtn) {
      if (step.isLast) {
        tutorialNextBtn.textContent = "開始體驗";
        tutorialNextBtn.classList.add('is-finish');
      } else {
        tutorialNextBtn.textContent = "下一步";
        tutorialNextBtn.classList.remove('is-finish');
      }
    }

    if (!step.targetId) {
      setSpotlightToCenter();
    } else {
      // 嘗試多次尋找目標元素，以處理頁面切換延遲
      const findAndHighlight = (attempts = 0) => {
        const target = document.getElementById(step.targetId);
        if (target) {
          console.log(`Tutorial: Found target element ${step.targetId}`);
          const rect = target.getBoundingClientRect();
          setSpotlightToElement(rect, step.placement);
        } else if (attempts < 10) {
          // 增加重試次數到 10 次，每次間隔 150ms
          console.log(`Tutorial: Target ${step.targetId} not found, retry ${attempts + 1}/10`);
          setTimeout(() => findAndHighlight(attempts + 1), 150);
        } else {
          console.warn(`Tutorial target not found after ${attempts} retries: ${step.targetId}`);
          setSpotlightToCenter();
        }
      };
      findAndHighlight();
    }
  };

  // 檢查是否需要切換頁面
  if (step.pageId) {
    const currentPage = document.querySelector('.page.is-active');
    const targetPage = document.getElementById(step.pageId);
    const needsPageSwitch = currentPage?.id !== step.pageId;

    if (needsPageSwitch && targetPage) {
      console.log(`Tutorial: Preloading page ${step.pageId} before rendering`);

      // 先切換頁面
      setActivePage(step.pageId);

      // 等待頁面完全載入和動畫完成
      // 使用 requestAnimationFrame 確保渲染完成
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          // 再等待一個較長的延遲確保所有元素都已渲染
          setTimeout(() => {
            console.log(`Tutorial: Page ${step.pageId} loaded, rendering tutorial content`);
            renderTutorialContent();
          }, 500);
        });
      });
    } else {
      // 不需要切換頁面，直接渲染
      console.log(`Tutorial: Already on correct page, rendering immediately`);
      setTimeout(renderTutorialContent, 300);
    }
  } else {
    // 沒有指定頁面，直接渲染
    setTimeout(renderTutorialContent, 300);
  }
}

function setSpotlightToCenter() {
  if (!tutorialSpotlight || !tutorialBubble) return;

  // 縮小聚光燈至 0，依賴 box-shadow 遮罩全屏
  tutorialSpotlight.style.width = '0px';
  tutorialSpotlight.style.height = '0px';
  tutorialSpotlight.style.top = '50%';
  tutorialSpotlight.style.left = '50%';

  tutorialSpotlight.style.boxShadow = '0 0 0 4000px rgba(0, 0, 0, 0.85)';

  tutorialBubble.style.top = '50%';
  tutorialBubble.style.left = '50%';
  tutorialBubble.style.transform = 'translate(-50%, -50%)';
  tutorialBubble.style.right = 'auto';
  tutorialBubble.style.bottom = 'auto';
}

function setSpotlightToElement(rect, placement) {
  if (!tutorialSpotlight || !tutorialBubble) return;

  const padding = 8;
  const bubbleGap = 20;

  tutorialSpotlight.style.width = `${rect.width + padding * 2}px`;
  tutorialSpotlight.style.height = `${rect.height + padding * 2}px`;
  tutorialSpotlight.style.top = `${rect.top - padding}px`;
  tutorialSpotlight.style.left = `${rect.left - padding}px`;

  tutorialBubble.style.transform = 'none';

  switch (placement) {
    case 'right':
      tutorialBubble.style.top = `${rect.top}px`;
      tutorialBubble.style.left = `${rect.right + padding + bubbleGap}px`;
      tutorialBubble.style.right = 'auto';
      tutorialBubble.style.bottom = 'auto';
      break;
    case 'left':
      tutorialBubble.style.top = `${rect.top}px`;
      tutorialBubble.style.right = `${window.innerWidth - rect.left + padding + bubbleGap}px`;
      tutorialBubble.style.left = 'auto';
      tutorialBubble.style.bottom = 'auto';
      break;
    case 'top':
      tutorialBubble.style.bottom = `${window.innerHeight - rect.top + padding + bubbleGap}px`;
      tutorialBubble.style.left = `${rect.left}px`;
      tutorialBubble.style.top = 'auto';
      tutorialBubble.style.right = 'auto';
      break;
    case 'bottom':
      tutorialBubble.style.top = `${rect.bottom + padding + bubbleGap}px`;
      tutorialBubble.style.left = `${rect.left}px`;
      tutorialBubble.style.bottom = 'auto';
      tutorialBubble.style.right = 'auto';
      break;
    default:
      setSpotlightToCenter();
      break;
  }
}

// 啟動
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTutorial);
} else {
  initTutorial();
}