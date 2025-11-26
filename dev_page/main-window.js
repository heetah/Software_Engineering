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

// 設定頁面元素
const dataPathDisplay = document.getElementById('data-path-display');
const clearHistoryButton = document.getElementById('clear-history-button');
const themeToggle = document.getElementById('theme-toggle-input');

/* 應用程式狀態 */
let currentSession = null;
let thinkingBubbleElement = null;

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

/* 應用程式初始化 */
bootstrapHistory().catch((error) => console.error('Failed to initialise history', error));

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
  const sessions = await refreshSessionList();
  
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
      const text = message?.payload?.content || '';
      if (!text) return;
      appendMessage(text, message.role, 'text');
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
    session: getSessionEnvelope(session)
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
    session: getSessionEnvelope(session)
  });
  fileUploadInput.value = '';
  setActivePage('page-chat');
}

/**
 * 在聊天視窗中追加一條訊息。
 * (已修改：將 Copy 按鈕一律放入氣泡內)
 */
function appendMessage(text, sender, messageType = 'text') {
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
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', () => {
    const textToCopy = messageType === 'thinking' ? '' : text;
    navigator.clipboard.writeText(textToCopy).then(() => {
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1500);
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
    // 加入 Copy 按鈕 (在氣泡內)
    messageBubble.appendChild(messageActions);
  } else {
    // 一般文字
    messageBubble.textContent = text;
    // 加入 Copy 按鈕 (在氣泡內 - 這是新邏輯)
    messageBubble.appendChild(messageActions);
  }

  messageContent.appendChild(messageBubble);
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
  
  if (response?.type === 'error') {
    appendMessage(`Error: ${content}`, 'ai', 'text');
    return;
  }

  if (!content && type !== 'thinking') return;

  appendMessage(content, 'ai', type === 'text' ? 'text' : type);

  if (!currentSession) {
    console.warn('AI response received without an active session; skipping persistence.');
    return;
  }

  persistMessage(currentSession.id, 'ai', content);
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
  if (!session) return null;
  return {
    id: session.id,
    sequence: session.sequence,
    title: session.title
  };
}

function persistMessage(sessionId, role, content) {
  ipcRenderer
    .invoke('history:add-message', { sessionId, role, content })
    .catch((error) => console.error('Unable to persist message', error));
}

async function createAndActivateSession() {
  const session = await ipcRenderer.invoke('history:create-session');
  currentSession = session;
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
    const sessions = await refreshSessionList();
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
