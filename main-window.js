/**
 * @file 渲染器進程核心腳本 (main-window.js)
 * (v2.0 - 整合新手教學、移除獨立說明頁、修正 JS 崩潰問題)
 */

const { ipcRenderer } = require('electron');

// 1. DOM 元素綁定 (移除 help 相關)
const chatDisplay = document.getElementById('chat-display');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const fileUploadButton = document.getElementById('file-upload-button');
const fileUploadInput = document.getElementById('file-upload-input');
const charCounter = document.getElementById('char-counter');

// 導航與頁面
const chatButton = document.getElementById('chat-button');
const historyButton = document.getElementById('history-button');
const settingsButton = document.getElementById('settings-button');
// [移除] const helpButton... (已刪除)

const historyList = document.getElementById('history-list');
const pageChat = document.getElementById('page-chat');
const pageSettings = document.getElementById('page-settings');
// [移除] const pageHelp... (已刪除)

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

// 側邊欄的新按鈕
const tutorialTriggerBtn = document.getElementById('tutorial-btn'); // 新手教學元素
const refreshSessionBtn = document.getElementById('refresh-session-btn'); // 側邊欄的刷新按鈕

/* 應用程式狀態 */
let currentSession = null;
let thinkingBubbleElement = null;
let currentLlmProvider = (localStorage.getItem('llmProvider') || 'auto');
let currentGeminiApiKey = localStorage.getItem('geminiApiKey') || '';
let currentOpenAIApiKey = localStorage.getItem('openaiApiKey') || '';

/* ====================================================================
 * 2. 事件監聽器綁定
 * ====================================================================
 */

// 訊息發送
sendButton?.addEventListener('click', () => {
  sendMessage().catch((error) => console.error('Failed to send message', error));
});

textInput?.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage().catch((error) => console.error('Failed to send message', error));
  }
});

// 檔案上傳
fileUploadButton?.addEventListener('click', () => fileUploadInput?.click());
fileUploadInput?.addEventListener('change', (event) => {
  handleFileUpload(event).catch((error) => console.error('Failed to handle file upload', error));
});

// 輸入框自動調整
textInput?.addEventListener('input', () => {
  autoResizeTextarea();
  updateCharCount();
});

// 側邊欄切換
historyButton?.addEventListener('click', () => {
  historyButton.classList.toggle('is-open');
  historyList.classList.toggle('is-open');
});

// 頁面切換 (移除 help 相關)
chatButton?.addEventListener('click', () => setActivePage('page-chat'));
settingsButton?.addEventListener('click', () => setActivePage('page-settings'));
// [移除] helpButton listener...

// 清除歷史
if (clearHistoryButton) {
  clearHistoryButton.addEventListener('click', () => {
    clearAllHistory().catch((error) => console.error('Failed to clear history', error));
  });
}

// 主題切換
if (themeToggle) {
  // 1. 初始化：讀取目前的 class 狀態，同步 Toggle 開關
  // 這樣如果 HTML head 已經設為 dark-mode，開關就會自動變成「開」
  const isDark = document.documentElement.classList.contains('dark-mode');
  themeToggle.checked = isDark;

  // 2. 監聽切換事件
  themeToggle.addEventListener('change', () => {
    if (themeToggle.checked) {
      document.documentElement.classList.add('dark-mode');
      localStorage.setItem('theme', 'dark'); // 寫入儲存
    } else {
      document.documentElement.classList.remove('dark-mode');
      localStorage.setItem('theme', 'light'); // 寫入儲存
    }
  });
}

// LLM 提供者選擇
if (llmProviderAuto && llmProviderGemini && llmProviderOpenAI) {
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

  llmProviderAuto.addEventListener('change', (e) => e.target.checked && handleLlmProviderChange('auto'));
  llmProviderGemini.addEventListener('change', (e) => e.target.checked && handleLlmProviderChange('gemini'));
  llmProviderOpenAI.addEventListener('change', (e) => e.target.checked && handleLlmProviderChange('openai'));

  // 修正 Toggle Switch 點擊
  document.querySelectorAll('.settings-toggle-option').forEach((option) => {
    option.addEventListener('click', (e) => {
      const input = option.querySelector('.toggle-switch__input');
      if (input && e.target !== input) {
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  });
}

// API Key 輸入回填
if (geminiApiKeyInput && currentGeminiApiKey) geminiApiKeyInput.value = currentGeminiApiKey;
if (openaiApiKeyInput && currentOpenAIApiKey) openaiApiKeyInput.value = currentOpenAIApiKey;

// 儲存 API Key
if (saveApiKeysButton) {
  saveApiKeysButton.addEventListener('click', () => {
    if (geminiApiKeyInput) {
      currentGeminiApiKey = geminiApiKeyInput.value.trim();
      localStorage.setItem('geminiApiKey', currentGeminiApiKey);
    }
    if (openaiApiKeyInput) {
      currentOpenAIApiKey = openaiApiKeyInput.value.trim();
      localStorage.setItem('openaiApiKey', currentOpenAIApiKey);
    }

    const originalText = saveApiKeysButton.textContent;
    saveApiKeysButton.textContent = '已儲存';
    saveApiKeysButton.style.opacity = '0.8';
    setTimeout(() => {
      saveApiKeysButton.textContent = originalText;
      saveApiKeysButton.style.opacity = '1';
    }, 1500);
  });
}

// [新增] 刷新按鈕：建立新對話
if (refreshSessionBtn) {
  refreshSessionBtn.addEventListener('click', async () => {
    // 呼叫建立新會話的函式
    await createAndActivateSession();

    // 選用：給予一點視覺回饋 (例如按鈕轉一下)
    const icon = refreshSessionBtn;
    icon.style.transition = 'transform 0.5s ease';
    icon.style.transform = 'rotate(180deg)';
    setTimeout(() => { icon.style.transform = 'rotate(0deg)'; }, 500);
  });
}

/* ====================================================================
 * 3. 應用程式初始化 (Bootstrap)
 * ====================================================================
 */
bootstrapHistory().catch((error) => console.error('Failed to initialise history', error));

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

/* ====================================================================
 * 4. 核心邏輯 (Session & Message)
 * ====================================================================
 */

async function refreshSessionList(activeSessionId, options = {}) {
  const { normalize = false } = options;
  try {
    const sessions = normalize
      ? await ipcRenderer.invoke('history:normalize')
      : await ipcRenderer.invoke('history:get-sessions');

    if (!historyList) return sessions;

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
  closeButton.textContent = '✕';
  closeButton.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await deleteSession(session.id);
  });

  item.addEventListener('click', (event) => {
    event.preventDefault();
    setActiveSession(session);
  });

  item.appendChild(title);
  item.appendChild(closeButton);
  return item;
}

async function ensureSession() {
  if (currentSession) return currentSession;
  return createAndActivateSession();
}

async function setActiveSession(session) {
  if (!session || (currentSession && currentSession.id === session.id)) return;
  currentSession = session;
  await loadMessages(session.id);
  await refreshSessionList(session.id);

  // UI 狀態更新
  historyButton?.classList.remove('is-open');
  historyList?.classList.remove('is-open');
  setActivePage('page-chat');
}

async function loadMessages(sessionId) {
  try {
    const messages = await ipcRenderer.invoke('history:get-messages', sessionId);
    if (!chatDisplay) return;

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

/* ====================================================================
 * 5. 訊息發送與 UI 處理
 * ====================================================================
 */

async function sendMessage() {
  const messageText = textInput.value.trim();
  if (messageText === '') return;

  const session = await ensureSession();
  appendMessage(messageText, 'user', 'text');

  textInput.value = '';
  autoResizeTextarea();
  updateCharCount();

  persistMessage(session.id, 'user', messageText);

  if (thinkingBubbleElement) thinkingBubbleElement.remove();
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

  if (thinkingBubbleElement) thinkingBubbleElement.remove();
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

function appendMessage(text, sender, messageType = 'text', options = {}) {
  if (!chatDisplay) return;

  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group', `message-group--${sender}`);

  const messageAvatar = document.createElement('div');
  messageAvatar.classList.add('message-avatar');
  messageAvatar.textContent = sender === 'ai' ? 'AI' : 'You';

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');

  const messageBubble = document.createElement('div');
  messageBubble.classList.add('message-bubble');

  // Copy 按鈕容器 (移出氣泡)
  const messageActions = document.createElement('div');
  messageActions.classList.add('message-actions');

  // 1. 複製按鈕
  const copyButton = document.createElement('button');
  copyButton.classList.add('action-button');
  copyButton.textContent = '複製';

  copyButton.addEventListener('click', () => {
    const textToCopy = messageType === 'thinking' ? '' : text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyButton.textContent = '已複製';
      setTimeout(() => { copyButton.textContent = '複製'; }, 2000);
    });
  });

  // 2. 下載按鈕 (如果有的話)
  if (messageType === 'download') {
    messageBubble.classList.add('message-bubble--download');
    const description = document.createElement('div');
    description.innerHTML = text || '輸出已準備好，點擊下載 zip。';
    messageBubble.appendChild(description);

    const downloadButton = document.createElement('button');
    downloadButton.classList.add('action-button');
    downloadButton.innerHTML = '下載'; // 與 Copy 風格一致
    downloadButton.style.marginRight = '10px'; // 間距

    downloadButton.addEventListener('click', async () => {
      if (!options.filePath) return;
      const originalContent = downloadButton.innerHTML;
      downloadButton.innerHTML = '處理中...';
      downloadButton.disabled = true;

      try {
        const result = await ipcRenderer.invoke('download:save-zip', {
          zipPath: options.filePath,
          defaultName: options.fileName || undefined
        });
        if (result?.ok) downloadButton.innerHTML = '已下載';
        else if (result?.cancelled) downloadButton.innerHTML = '已取消';
        else downloadButton.innerHTML = '失敗';
      } catch (err) {
        console.error('Failed to download', err);
        downloadButton.innerHTML = '錯誤';
      }

      setTimeout(() => {
        downloadButton.innerHTML = originalContent;
        downloadButton.disabled = false;
      }, 2000);
    });

    // 下載按鈕排在複製前面
    messageActions.appendChild(downloadButton);
  } else if (messageType === 'thinking') {
    messageBubble.classList.add('message-bubble--thinking');
    messageBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  } else if (messageType === 'code') {
    messageBubble.classList.add('message-bubble--code');
    messageBubble.textContent = text;
  } else {
    messageBubble.textContent = text;
  }

  // 統一將複製按鈕加入
  if (messageType !== 'thinking') {
    messageActions.appendChild(copyButton);
  }

  messageContent.appendChild(messageBubble);

  // 如果不是思考中，加入按鈕列 (在氣泡下方)
  if (messageType !== 'thinking') {
    messageContent.appendChild(messageActions);
  }

  messageGroup.appendChild(messageAvatar);
  messageGroup.appendChild(messageContent);
  chatDisplay.appendChild(messageGroup);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;

  return messageGroup;
}

/* IPC 監聽與其他輔助 */
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
});

function loadSettingsInfo() {
  if (dataPathDisplay) {
    ipcRenderer.invoke('settings:get-app-data-path')
      .then((path) => { dataPathDisplay.value = path; })
      .catch((error) => {
        console.error(error);
        dataPathDisplay.value = '無法載入路徑';
      });
  }
}

async function clearAllHistory() {
  try {
    const result = await ipcRenderer.invoke('history:clear-all');
    if (result.ok) {
      await bootstrapHistory();
      if (clearHistoryButton) {
        const originalText = clearHistoryButton.textContent;
        clearHistoryButton.textContent = '已清除所有紀錄';
        clearHistoryButton.style.opacity = '0.7';
        clearHistoryButton.disabled = true;
        setTimeout(() => {
          clearHistoryButton.textContent = originalText;
          clearHistoryButton.style.opacity = '1';
          clearHistoryButton.disabled = false;
        }, 2000);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

function autoResizeTextarea() {
  if (!textInput) return;
  textInput.style.height = 'auto';
  textInput.style.height = `${textInput.scrollHeight}px`;
}

function updateCharCount() {
  if (!textInput || !charCounter) return;
  charCounter.textContent = `${textInput.value.length}/2000`;
}

// [修正] 頁面切換邏輯 (移除 Help)
function setActivePage(pageIdToShow) {
  // 移除舊的 active
  pageChat?.classList.remove('is-active');
  pageSettings?.classList.remove('is-active');

  chatButton?.classList.remove('is-active');
  settingsButton?.classList.remove('is-active');

  // 加入新的 active
  if (pageIdToShow === 'page-chat') {
    pageChat?.classList.add('is-active');
    chatButton?.classList.add('is-active');
  } else if (pageIdToShow === 'page-settings') {
    pageSettings?.classList.add('is-active');
    settingsButton?.classList.add('is-active');
  }
}

function getSessionEnvelope(session) {
  if (!session) return null;
  return { id: session.id, sequence: session.sequence, title: session.title };
}

function persistMessage(sessionId, role, content, options = {}) {
  const payload = { role, content, type: options.type || 'text' };
  if (options.download) payload.download = options.download;

  ipcRenderer.invoke('history:add-message', { sessionId, role, content, payload })
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
    if (!result?.ok) return;
    if (currentSession && currentSession.id === sessionId) currentSession = null;

    const sessions = await refreshSessionList(currentSession?.id, { normalize: true });
    if (sessions.length > 0) await setActiveSession(sessions[0]);
    else await createAndActivateSession();
  } catch (error) {
    console.error('Unable to delete session', error);
  }
}

function showGreetingIfEmpty() {
  if (!chatDisplay || chatDisplay.children.length > 0) return;
  const greeting = "您好，我是您的開發助理。請問今天有什麼可以協助您的嗎？";
  appendMessage(greeting, 'ai', 'text');
}


/* ====================================================================
 * 6. 新手教學模組 (Onboarding System) - 多頁面導覽版
 * ====================================================================
 */

// 定義教學步驟
/* main-window.js - 更新 tutorialSteps */

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
    text: "<strong style='font-size: 18px;'>快速捷徑</strong><br>這裡有兩個實用的小按鈕：<br>🎓 <strong>重看教學</strong>：忘記功能時隨時點擊複習。<br>➕ <strong>新對話</strong>：一鍵清除當前畫面，開始全新的專案 (Refresh)。",
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
  if (currentStepIndex >= tutorialSteps.length) {
    endTutorial();
  } else {
    renderStep(currentStepIndex);
  }
}

// 渲染步驟
function renderStep(index) {
  const step = tutorialSteps[index];

  // 自動換頁
  if (step.pageId) {
    setActivePage(step.pageId);
  }

  // 延遲渲染以等待 DOM 更新
  setTimeout(() => {
    if (tutorialText) tutorialText.innerHTML = step.text;

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
      const target = document.getElementById(step.targetId);
      if (target) {
        const rect = target.getBoundingClientRect();
        setSpotlightToElement(rect, step.placement);
      } else {
        console.warn(`Tutorial target not found: ${step.targetId}`);
        setSpotlightToCenter();
      }
    }
  }, 350);
}

function setSpotlightToCenter() {
  if (!tutorialSpotlight || !tutorialBubble) return;

  // 縮小聚光燈至 0，依賴 box-shadow 遮罩全屏
  tutorialSpotlight.style.width = '0px';
  tutorialSpotlight.style.height = '0px';
  tutorialSpotlight.style.top = '50%';
  tutorialSpotlight.style.left = '50%';

  tutorialSpotlight.style.boxShadow = '0 0 0 4000px rgba(0, 0, 0, 0.7)';

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