/**
 * @file 渲染器進程核心腳本 (main-window.js)
 * (已修復 ReferenceError 並整合 Agent 優化功能)
 */

/*
 * ====================================================================
 * 1. 模組匯入與 DOM 元素快取
 * ====================================================================
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

// 設定頁面元素
const dataPathDisplay = document.getElementById('data-path-display');
const clearHistoryButton = document.getElementById('clear-history-button');
const themeToggle = document.getElementById('theme-toggle-input');

/*
 * ====================================================================
 * 2. 應用程式狀態
 * ====================================================================
 */
let currentSession = null;

/*
 * ====================================================================
 * 3. 綁定事件監聽器
 * ====================================================================
 */

sendButton.addEventListener('click', () => {
  sendMessage().catch((error) => {
    console.error('Failed to send message', error);
  });
});

textInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage().catch((error) => {
      console.error('Failed to send message', error);
    });
  }
});

fileUploadButton.addEventListener('click', () => fileUploadInput.click());
fileUploadInput.addEventListener('change', (event) => {
  handleFileUpload(event).catch((error) => {
    console.error('Failed to handle file upload', error);
  });
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

if (clearHistoryButton) {
  clearHistoryButton.addEventListener('click', () => {
    clearAllHistory().catch((error) => {
      console.error('Failed to clear history', error);
    });
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


/*
 * ====================================================================
 * 4. 應用程式初始化
 * ====================================================================
 */

bootstrapHistory().catch((error) => {
  console.error('Failed to initialise history', error);
});


/*
 * ====================================================================
 * 5. 核心功能函式 - 會話與歷史紀錄
 * ====================================================================
 */

function createHistoryItem(session) {
  const item = document.createElement('a');
  item.href = '#';
  item.classList.add('history-item');
  item.dataset.sessionId = String(session.id);
  item.textContent = session.title;

  item.addEventListener('click', (event) => {
    event.preventDefault();
    setActiveSession(session).catch((error) => {
      console.error('Failed to switch session', error);
    });
  });

  return item;
}

async function bootstrapHistory() {
  const sessions = await refreshSessionList();
  
  if (sessions.length > 0) {
    await setActiveSession(sessions[0]);
  } else {
    // **(Item 2) 新使用者迎賓邏輯**
    currentSession = null;
    chatDisplay.innerHTML = '';
    
    // 主動顯示歡迎訊息 (但不持久化，直到使用者開始對話)
    const greeting = "您好，我是您的開發助理。請問今天有什麼可以協助您的嗎？";
    appendMessage(greeting, 'ai', 'text');
  }
  
  updateCharCount();
  autoResizeTextarea();
  loadSettingsInfo();
}

async function refreshSessionList(activeSessionId) {
  try {
    const sessions = await ipcRenderer.invoke('history:get-sessions');
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

  const session = await ipcRenderer.invoke('history:create-session');
  currentSession = session;
  await refreshSessionList(session.id);
  return session;
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
      const text = message?.payload?.content || '';
      if (!text) {
        return;
      }
      // 這裡假設歷史紀錄目前都是 text，未來可以擴充儲存 type
      appendMessage(text, message.role, 'text');
    });
  } catch (error) {
    console.error('Unable to load messages', error);
  }
}

/*
 * ====================================================================
 * 6. 核心功能函式 - 訊息與檔案處理
 * ====================================================================
 */

async function sendMessage() {
  const messageText = textInput.value.trim();
  if (messageText === '') {
    return;
  }

  const session = await ensureSession();
  
  // 顯示使用者訊息
  appendMessage(messageText, 'user', 'text');
  
  textInput.value = '';
  autoResizeTextarea();
  updateCharCount();

  persistMessage(session.id, 'user', messageText);
  
  // 顯示 Agent "思考中" 狀態 (Item 4 預備)
  // 注意：這裡我們只是模擬 UI，實際應該由後端事件觸發
  // appendMessage('', 'ai', 'thinking'); 

  ipcRenderer.send('message-to-agent', {
    type: 'text',
    content: messageText,
    session: getSessionEnvelope(session)
  });
  
  setActivePage('page-chat');
}

async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];
  const notice = `Selected file: ${file.name}`;
  const session = await ensureSession();
  appendMessage(notice, 'user', 'text');

  persistMessage(session.id, 'user', notice);
  ipcRenderer.send('message-to-agent', {
    type: 'file',
    path: file.path,
    session: getSessionEnvelope(session)
  });
  fileUploadInput.value = '';
  setActivePage('page-chat');
}

/**
 * 在聊天視窗中追加一條訊息。
 * (已重構：修復 ReferenceError 並支援多種訊息類型)
 * @param {string} text - 訊息內容
 * @param {string} sender - 'user' 或 'ai'
 * @param {string} messageType - 'text', 'code', 'thinking'
 */
function appendMessage(text, sender, messageType = 'text') {
  // 1. 建立所有基礎 DOM 元素
  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group', `message-group--${sender}`);

  const messageAvatar = document.createElement('div');
  messageAvatar.classList.add('message-avatar');
  messageAvatar.textContent = sender === 'ai' ? 'AI' : 'You';

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');

  const messageBubble = document.createElement('div');
  messageBubble.classList.add('message-bubble');

  // **關鍵修正**：在這裡定義 messageActions，確保它對下面的所有 if/else 都可用
  const messageActions = document.createElement('div');
  messageActions.classList.add('message-actions');

  const copyButton = document.createElement('button');
  copyButton.classList.add('action-button');
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', () => {
    // 如果是 thinking 狀態，沒有文字可複製
    const textToCopy = messageType === 'thinking' ? '' : text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1500);
    });
  });

  // 2. 根據 messageType 處理不同的 UI 邏輯
  if (messageType === 'thinking') {
    // (Item 4) 思考中：顯示動態跳動的點
    messageBubble.classList.add('message-bubble--thinking');
    messageBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
    
    // 思考中不需要顯示 Copy 按鈕
    messageContent.appendChild(messageBubble);
    
  } else if (messageType === 'code') {
    // (Item 3) 程式碼：透明背景 + 內嵌 Copy 按鈕
    messageBubble.classList.add('message-bubble--code');
    messageBubble.textContent = text; // 設置程式碼文字
    
    // 將 Copy 按鈕加入 Actions
    messageActions.appendChild(copyButton);
    
    // **關鍵**：將 Actions 放入 Bubble 內部 (因為是 absolute positioning)
    messageBubble.appendChild(messageActions);
    messageContent.appendChild(messageBubble);
    
  } else {
    // 一般文字 (預設)
    messageBubble.textContent = text;
    
    // 將 Copy 按鈕加入 Actions
    messageActions.appendChild(copyButton);
    
    // 一般模式下，Actions 在 Bubble 外部 (下方)
    messageContent.appendChild(messageBubble);
    messageContent.appendChild(messageActions);
  }

  // 3. 組合 DOM
  messageGroup.appendChild(messageAvatar);
  messageGroup.appendChild(messageContent);
  chatDisplay.appendChild(messageGroup);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

/*
 * ====================================================================
 * 7. IPC 監聽器 - 接收 AI 回應
 * ====================================================================
 */

ipcRenderer.on('message-from-agent', (_event, response) => {
  // 解析回應
  const type = response?.type || 'text';
  const content = typeof response === 'string' ? response : response?.content || '';
  
  // 錯誤處理
  if (response?.type === 'error') {
    appendMessage(`Error: ${content}`, 'ai', 'text');
    return;
  }

  if (!content && type !== 'thinking') {
    return;
  }

  // 呼叫 appendMessage，傳入類型 (text, code, thinking)
  // 假設後端目前還不會傳 'code' type，這裡你可以手動測試把 'text' 改成 'code'
  appendMessage(content, 'ai', type === 'text' ? 'text' : type);

  if (!currentSession) {
    console.warn('AI response received without an active session; skipping persistence.');
    return;
  }

  // 持久化 (目前只存文字)
  persistMessage(currentSession.id, 'ai', content);
});

/*
 * ====================================================================
 * 8. 設定頁面功能
 * ====================================================================
 */

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
      setActivePage('page-chat');
      
    } else if (result.cancelled) {
      console.log('History clear operation was cancelled.');
    } else {
      console.error('Failed to clear history:', result.error);
    }
  } catch (error) {
    console.error('Error invoking history:clear-all:', error);
  }
}

/*
 * ====================================================================
 * 9. UI 輔助函式
 * ====================================================================
 */

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
  chatButton.classList.remove('is-active');
  settingsButton.classList.remove('is-active');

  if (pageIdToShow === 'page-chat') {
    pageChat.classList.add('is-active');
    chatButton.classList.add('is-active');
  } else if (pageIdToShow === 'page-settings') {
    pageSettings.classList.add('is-active');
    settingsButton.classList.add('is-active');
  }
}

function getSessionEnvelope(session) {
  if (!session) {
    return null;
  }

  return {
    id: session.id,
    sequence: session.sequence,
    title: session.title
  };
}

function persistMessage(sessionId, role, content) {
  ipcRenderer
    .invoke('history:add-message', {
      sessionId,
      role,
      content
    })
    .catch((error) => {
      console.error('Unable to persist message', error);
    });
}