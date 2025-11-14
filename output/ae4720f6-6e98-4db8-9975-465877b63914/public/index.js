// public/index.js
// Main JavaScript file for the frontend application.
// This script handles user interactions, sends queries to a backend API,
// and displays responses, simulating interaction with an AI agent.
// It does NOT directly integrate OpenAI API or access Node.js environment variables
// as it runs in the browser.

/**
 * @typedef {Object} AgentResponse
 * @property {string} message - The AI agent's response message.
 * @property {string} [error] - Optional error message if the operation failed.
 */

// --- DOM Element References ---
// CRITICAL: These selectors assume the following HTML structure exists:
// <div id="app-container">
//   <div id="chat-window">
//     <div id="response-display" aria-live="polite"></div>
//   </div>
//   <div id="input-area">
//     <input type="text" id="user-input" placeholder="Type your message..." aria-label="User message input">
//     <button id="send-button" aria-label="Send message">Send</button>
//   </div>
//   <div id="loading-indicator" role="status" aria-live="assertive" hidden>Loading...</div>
//   <div id="error-message" role="alert" aria-live="assertive" hidden></div>
// </div>
const userInput = document.getElementById('user-input');
const sendButton = document.getElementById('send-button');
const responseDisplay = document.getElementById('response-display');
const loadingIndicator = document.getElementById('loading-indicator');
const errorMessageDisplay = document.getElementById('error-message');

// --- Utility Functions ---

/**
 * Displays a message in the response area.
 * @param {string} sender - The sender of the message (e.g., 'User', 'Agent').
 * @param {string} message - The message content.
 * @param {boolean} isError - True if the message is an error, false otherwise.
 */
function displayMessage(sender, message, isError = false) {
  const messageElement = document.createElement('div');
  messageElement.classList.add('chat-message');
  messageElement.classList.add(sender.toLowerCase());
  if (isError) {
    messageElement.classList.add('error');
  }
  messageElement.innerHTML = `<strong>${sender}:</strong> ${message}`;
  responseDisplay.appendChild(messageElement);
  // Scroll to the bottom to show the latest message
  responseDisplay.scrollTop = responseDisplay.scrollHeight;
}

/**
 * Shows or hides the loading indicator.
 * Disables/enables input and send button accordingly.
 * @param {boolean} show - True to show, false to hide.
 */
function toggleLoading(show) {
  if (loadingIndicator) {
    loadingIndicator.hidden = !show;
    if (show) {
      // For accessibility, move focus to the loading indicator when it appears
      loadingIndicator.focus();
    }
  }
  if (sendButton) {
    sendButton.disabled = show;
  }
  if (userInput) {
    userInput.disabled = show;
  }
}

/**
 * Displays an application-level error message in a dedicated error area.
 * @param {string} message - The error message to display.
 */
function showAppError(message) {
  if (errorMessageDisplay) {
    errorMessageDisplay.textContent = `Error: ${message}`;
    errorMessageDisplay.hidden = false;
    // For accessibility, move focus to the error message when it appears
    errorMessageDisplay.focus();
  }
}

/**
 * Clears any application-level error messages.
 */
function clearAppError() {
  if (errorMessageDisplay) {
    errorMessageDisplay.textContent = '';
    errorMessageDisplay.hidden = true;
  }
}

// --- Event Handlers ---

/**
 * Handles the submission of a user query.
 * This function is asynchronous because it makes an API call to the backend.
 * It displays user input, sends it to the backend, and then displays the agent's response
 * or any errors encountered during the process.
 */
async function handleSendMessage() {
  clearAppError(); // Clear previous application-level errors
  const query = userInput.value.trim();

  if (!query) {
    showAppError('Please enter a message.');
    return;
  }

  displayMessage('User', query); // Display user's message in the chat window
  userInput.value = ''; // Clear the input field
  toggleLoading(true); // Show loading indicator and disable input/button

  try {
    // Make a POST request to the backend API endpoint for agent chat.
    // The backend is responsible for communicating with the actual AI agent.
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: query }), // Send the user's query as a JSON object
    });

    if (!response.ok) {
      // If the HTTP response status is not OK (e.g., 4xx or 5xx),
      // attempt to parse an error message from the response body.
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(`Server error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    /** @type {AgentResponse} */
    const data = await response.json(); // Parse the JSON response from the server

    if (data.error) {
      // If the response contains an 'error' field, display it as an agent error.
      displayMessage('Agent', `Error: ${data.error}`, true);
    } else if (data.message) {
      // If the response contains a 'message' field, display it as the agent's response.
      displayMessage('Agent', data.message);
    } else {
      // Handle cases where the response structure is unexpected.
      displayMessage('Agent', 'Received an unexpected response from the agent.', true);
    }

  } catch (error) {
    // Catch any network errors or errors thrown during response processing.
    console.error('Failed to communicate with agent:', error);
    showAppError(`Failed to send message: ${error.message}`);
    displayMessage('System', `Could not connect to the agent. Please try again.`, true);
  } finally {
    // Ensure loading state is reset regardless of success or failure.
    toggleLoading(false);
    // Re-focus on the input field for continuous interaction
    if (userInput) {
      userInput.focus();
    }
  }
}

// --- Initialization ---

/**
 * Initializes the application when the DOM is fully loaded.
 * Attaches event listeners to interactive elements and sets initial UI state.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Attach click listener to the send button
  if (sendButton) {
    sendButton.addEventListener('click', handleSendMessage);
  }

  // Attach keypress listener to the user input field
  if (userInput) {
    // Allow sending message by pressing Enter key
    userInput.addEventListener('keypress', (event) => {
      // Check if the Enter key was pressed and the send button is not disabled (i.e., not loading)
      if (event.key === 'Enter' && !sendButton.disabled) {
        event.preventDefault(); // Prevent default form submission behavior (if input is in a form)
        handleSendMessage();
      }
    });
  }

  // Set initial UI state
  toggleLoading(false); // Ensure loading indicator is hidden initially
  clearAppError(); // Clear any stale error messages
  if (userInput) {
    userInput.focus(); // Focus on input field for immediate user interaction
  }
});