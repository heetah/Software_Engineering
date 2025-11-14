// Inferred HTML structure for this JavaScript file (as no HTML was provided):
// <div id="app-container">
//   <h1>Architect Agent</h1>
//   <textarea id="user-input" placeholder="Enter your architectural query..." rows="5"></textarea>
//   <button id="submit-query-btn">Ask Agent</button>
//   <div id="response-display"></div>
//   <p id="status-message"></p>
// </div>

/**
 * @file Main frontend JavaScript for the Architect Agent application.
 * Handles user input, communicates with the backend, and displays agent responses.
 * This file is designed to be included via a <script> tag in an HTML file.
 */

// --- DOM Element References ---
// CRITICAL: These selectors must exactly match the IDs in the HTML file.
const userInputElement = document.getElementById('user-input');
const submitButtonElement = document.getElementById('submit-query-btn');
const responseDisplayElement = document.getElementById('response-display');
const statusMessageElement = document.getElementById('status-message');

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
  // Ensure all DOM elements are available before attaching listeners.
  // CRITICAL: Check for element existence before attaching listeners to prevent errors.
  if (submitButtonElement) {
    // CRITICAL: Function name 'handleSubmitQuery' must match any direct HTML event attributes (e.g., onclick) if used.
    submitButtonElement.addEventListener('click', handleSubmitQuery);
  } else {
    console.error('Error: Submit button element with ID "submit-query-btn" not found. Check HTML structure.');
  }

  // Initial status message for the user.
  updateStatus('Ready to assist.', 'info');
});

/**
 * Handles the submission of a user query to the backend agent.
 * This function is asynchronous as it involves network requests.
 * @async
 * @param {Event} event - The click event from the submit button.
 */
async function handleSubmitQuery(event) {
  // Prevent the default form submission behavior if the button is inside a form.
  event.preventDefault();

  // Retrieve and trim the user's query from the input field.
  const userQuery = userInputElement ? userInputElement.value.trim() : '';

  // Basic input validation.
  if (!userQuery) {
    updateStatus('Please enter a query before asking the agent.', 'error');
    return;
  }

  // Update UI to reflect ongoing process.
  updateStatus('Sending query to agent...', 'info');
  disableInputAndButton(true);
  displayResponse(''); // Clear previous response

  try {
    // Inferring a backend API endpoint for agent interaction.
    // The backend would handle the OpenAI integration and environment variables.
    // Inferred payload: { query: string }
    const response = await fetch('/api/agent/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: userQuery }),
    });

    // Handle non-OK HTTP responses (e.g., 4xx, 5xx).
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }

    // Parse the JSON response from the backend.
    // Inferred response payload: { agentResponse: string, ... }
    const data = await response.json();

    // Display the agent's response and update status.
    displayResponse(data.agentResponse || 'No response received from the agent.', 'success');
    updateStatus('Query successful!', 'success');
    clearInput(); // Clear the input field after a successful query.

  } catch (error) {
    // Centralized error handling for network or API issues.
    console.error('Error submitting query:', error);
    displayResponse('Error: Could not get a response from the agent. Please try again later.', 'error');
    updateStatus(`Error: ${error.message}`, 'error');
  } finally {
    // Re-enable input and button regardless of success or failure.
    disableInputAndButton(false);
  }
}

/**
 * Displays the agent's response in the designated display area.
 * @param {string} message - The message content to display.
 * @param {'success' | 'error' | 'info'} [type='info'] - The type of message for styling/context (e.g., via CSS classes).
 */
function displayResponse(message, type = 'info') {
  if (responseDisplayElement) {
    // Using innerHTML for rich content, but sanitize if user-generated content is involved.
    responseDisplayElement.innerHTML = `<p class="response-${type}">${message}</p>`;
    // Optional: Scroll to the bottom if the response area is scrollable.
    responseDisplayElement.scrollTop = responseDisplayElement.scrollHeight;
  }
}

/**
 * Updates the status message displayed to the user.
 * @param {string} message - The status message content to display.
 * @param {'success' | 'error' | 'info'} [type='info'] - The type of message for styling/context (e.g., via CSS classes).
 */
function updateStatus(message, type = 'info') {
  if (statusMessageElement) {
    statusMessageElement.textContent = message;
    // Clear previous status classes and add the new one for dynamic styling.
    statusMessageElement.className = ''; // Reset classes
    statusMessageElement.classList.add(`status-${type}`);
  }
}

/**
 * Clears the user input field.
 */
function clearInput() {
  if (userInputElement) {
    userInputElement.value = '';
  }
}

/**
 * Disables or enables the user input field and submit button during processing
 * to prevent multiple submissions or changes while a request is pending.
 * @param {boolean} disable - True to disable, false to enable.
 */
function disableInputAndButton(disable) {
  if (userInputElement) {
    userInputElement.disabled = disable;
  }
  if (submitButtonElement) {
    submitButtonElement.disabled = disable;
  }
}


// Generated with mock API for public/index.js
