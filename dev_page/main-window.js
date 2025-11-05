const { ipcRenderer } = require('electron');

const chatDisplay = document.getElementById('chat-display');
const textInput = document.getElementById('text-input');
const sendButton = document.getElementById('send-button');
const fileUploadButton = document.getElementById('file-upload-button');
const fileUploadInput = document.getElementById('file-upload-input');
const charCounter = document.getElementById('char-counter');

const chatButton = document.getElementById('chat-button');
const historyButton = document.getElementById('history-button');
const settingsButton = document.getElementById('settings-button');
const historyList = document.getElementById('history-list');
const pageChat = document.getElementById('page-chat');
const pageSettings = document.getElementById('page-settings');

let currentSession = null;

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

bootstrapHistory().catch((error) => {
  console.error('Failed to initialise history', error);
});

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
    currentSession = null;
    chatDisplay.innerHTML = '';
  }
  updateCharCount();
  autoResizeTextarea();
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
      appendMessage(text, message.role);
    });
  } catch (error) {
    console.error('Unable to load messages', error);
  }
}

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
  ipcRenderer.send('message-to-agent', {
    type: 'file',
    path: file.path,
    session: getSessionEnvelope(session)
  });
  fileUploadInput.value = '';
  setActivePage('page-chat');
}

function appendMessage(text, sender) {
  const messageGroup = document.createElement('div');
  messageGroup.classList.add('message-group', `message-group--${sender}`);

  const messageAvatar = document.createElement('div');
  messageAvatar.classList.add('message-avatar');
  messageAvatar.textContent = sender === 'ai' ? 'AI' : 'You';

  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');

  const messageBubble = document.createElement('div');
  messageBubble.classList.add('message-bubble');
  messageBubble.textContent = text;

  const messageActions = document.createElement('div');
  messageActions.classList.add('message-actions');

  const copyButton = document.createElement('button');
  copyButton.classList.add('action-button');
  copyButton.textContent = 'Copy';
  copyButton.addEventListener('click', () => {
    navigator.clipboard.writeText(text).then(() => {
      copyButton.textContent = 'Copied';
      setTimeout(() => {
        copyButton.textContent = 'Copy';
      }, 1500);
    });
  });

  messageActions.appendChild(copyButton);
  messageContent.appendChild(messageBubble);
  messageContent.appendChild(messageActions);
  messageGroup.appendChild(messageAvatar);
  messageGroup.appendChild(messageContent);
  chatDisplay.appendChild(messageGroup);
  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

ipcRenderer.on('message-from-agent', (_event, response) => {
  const text =
    typeof response === 'string'
      ? response
      : response?.type === 'text'
      ? response.content
      : response?.type === 'error'
      ? `Error: ${response.content}`
      : '';

  if (!text) {
    return;
  }

  appendMessage(text, 'ai');

  if (!currentSession) {
    console.warn('AI response received without an active session; skipping persistence.');
    return;
  }

  persistMessage(currentSession.id, 'ai', text);
});

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
