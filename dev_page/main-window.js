/**
 * @file 渲染器進程核心腳本 (main-window.js)
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

// 導航 (Navigation) 與頁面 (Pages) 相關
const chatButton = document.getElementById('chat-button');
const historyButton = document.getElementById('history-button');
const settingsButton = document.getElementById('settings-button');
const historyList = document.getElementById('history-list');
const pageChat = document.getElementById('page-chat');
const pageSettings = document.getElementById('page-settings');

// *** 新增：設定頁面元素 ***
const dataPathDisplay = document.getElementById('data-path-display');
const clearHistoryButton = document.getElementById('clear-history-button');
const themeToggle = document.getElementById('theme-toggle-input');

/*
 * ====================================================================
 * 2. 應用程式狀態
 * ====================================================================
 */
let currentSession = null;
let thinkingBubbleElement = null;

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

// *** 新增：為清除按鈕綁定事件 ***
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

/**
 * 應用程式啟動時呼叫：初始化歷史紀錄列表。
 * * 修改：同時載入設定頁面資訊
 */
async function bootstrapHistory() {
  const sessions = await refreshSessionList();
  const sessionToReuse = selectBootstrapSession(sessions);
  if (sessionToReuse) {
    await setActiveSession(sessionToReuse);
  } else {
    try {
      await createLaunchSession();
    } catch (error) {
      console.error('Unable to create a session on launch', error);
      currentSession = null;
      chatDisplay.innerHTML = '';
    }
  }
  updateCharCount();
  autoResizeTextarea();
  // *** 新增：載入設定頁面的內容 ***
  loadSettingsInfo();
  showGreetingIfEmpty();
}

function selectBootstrapSession(sessions) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return null;
  }
  const latestSession = sessions[0];
  const messageCount = Number(latestSession?.message_count ?? latestSession?.messageCount ?? 0);
  if (messageCount === 0) {
    return latestSession;
  }
  return null;
}

async function createLaunchSession() {
  const session = await ipcRenderer.invoke('history:create-session');
  await setActiveSession(session);
  return session;
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
    clearThinkingBubble();
    chatDisplay.innerHTML = '';

    messages.forEach((message) => {
      const text = message?.payload?.content || '';
      if (!text) {
        return;
      }
      appendMessage(text, message.role);
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
  appendMessage(messageText, 'user');
  textInput.value = '';
  autoResizeTextarea();
  updateCharCount();

  persistMessage(session.id, 'user', messageText);
  clearThinkingBubble();
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
  if (!files || files.length === 0) {
    return;
  }

  const file = files[0];
  const notice = `Selected file: ${file.name}`;
  const session = await ensureSession();
  appendMessage(notice, 'user');

  persistMessage(session.id, 'user', notice);
  clearThinkingBubble();
  thinkingBubbleElement = appendMessage('', 'ai', 'thinking');
  ipcRenderer.send('message-to-agent', {
    type: 'file',
    path: file.path,
    session: getSessionEnvelope(session)
  });
  fileUploadInput.value = '';
  setActivePage('page-chat');
}

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

  const messageActions = document.createElement('div');
  messageActions.classList.add('message-actions');

  let copyButton = null;
  if (messageType !== 'thinking') {
    copyButton = document.createElement('button');
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
  }

  if (messageType === 'thinking') {
    messageBubble.classList.add('message-bubble--thinking');
    messageBubble.innerHTML = '<span class="dot"></span><span class="dot"></span><span class="dot"></span>';
  } else if (messageType === 'code') {
    messageBubble.classList.add('message-bubble--code');
    messageBubble.textContent = text;
    if (copyButton) {
      messageActions.appendChild(copyButton);
      messageBubble.appendChild(messageActions);
    }
  } else {
    messageBubble.textContent = text;
    if (copyButton) {
      messageActions.appendChild(copyButton);
    }
  }

  messageContent.appendChild(messageBubble);
  if (messageType === 'text' && messageActions.children.length > 0) {
    messageContent.appendChild(messageActions);
  }
  messageGroup.appendChild(messageAvatar);
  messageGroup.appendChild(messageContent);
  chatDisplay.appendChild(messageGroup);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;

  return messageGroup;
}

/*
 * ====================================================================
 * 7. IPC 監聽器 - 接收 AI 回應
 * ====================================================================
 */

ipcRenderer.on('message-from-agent', (_event, response) => {
  clearThinkingBubble();

  const type = typeof response === 'string' ? 'text' : response?.type || 'text';
  const content = typeof response === 'string' ? response : response?.content || '';

  if (type === 'error') {
    const errorText = content ? `Error: ${content}` : 'Error';
    appendMessage(errorText, 'ai', 'text');
    if (currentSession) {
      persistMessage(currentSession.id, 'ai', errorText);
    }
    return;
  }

  if (type === 'thinking') {
    thinkingBubbleElement = appendMessage('', 'ai', 'thinking');
    return;
  }

  const messageType = type === 'code' ? 'code' : 'text';
  if (!content && messageType !== 'thinking') {
    return;
  }

  appendMessage(content, 'ai', messageType);

  if (!currentSession) {
    console.warn('AI response received without an active session; skipping persistence.');
    return;
  }

  persistMessage(currentSession.id, 'ai', content);
});

/*
 * ====================================================================
 * 8. 新增：設定頁面功能
 * ====================================================================
 */

/**
 * 載入設定頁面的動態資訊 (例如資料路徑)
 */
function loadSettingsInfo() {
  if (dataPathDisplay) {
    ipcRenderer.invoke('settings:get-app-data-path')
      .then((path) => {
        dataPathDisplay.value = path; // 將路徑填入 input
      })
      .catch((error) => {
        console.error('Failed to get data path', error);
        dataPathDisplay.value = '無法載入路徑';
      });
  }
}

/**
 * 呼叫主進程來清除所有歷史紀錄
 */
async function clearAllHistory() {
  try {
    // 呼叫主進程的 API (這會彈出確認框)
    const result = await ipcRenderer.invoke('history:clear-all');

    if (result.ok) {
      // 如果成功刪除
      console.log('History cleared successfully.');
      // 關鍵：立即刷新整個 UI
      await bootstrapHistory(); 
      // 切換回聊天頁面
      setActivePage('page-chat');
      
    } else if (result.cancelled) {
      // 如果使用者在確認框中按了 "取消"
      console.log('History clear operation was cancelled.');
    } else {
      // 如果發生了其他錯誤
      console.error('Failed to clear history:', result.error);
    }
  } catch (error) {
    console.error('Error invoking history:clear-all:', error);
  }
}


/*
 * ====================================================================
 * 9. UI 輔助函式 (Utility Functions)
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

function showGreetingIfEmpty() {
  if (!chatDisplay || chatDisplay.children.length > 0) {
    return;
  }
  appendMessage('你好，我可以協助你，想聊什麼？', 'ai', 'text');
}

function clearThinkingBubble() {
  if (thinkingBubbleElement && typeof thinkingBubbleElement.remove === 'function') {
    thinkingBubbleElement.remove();
  }
  thinkingBubbleElement = null;
}
