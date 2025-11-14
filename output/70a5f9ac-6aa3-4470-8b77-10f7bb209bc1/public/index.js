/**
 * @file Main frontend JavaScript file for handling user interactions and
 *       communicating with the backend AI service.
 * @description This script manages DOM manipulation, event listeners, and
 *              API calls to the backend to leverage AI-powered features.
 */

// --- DOM Element References ---
const aiInput = document.getElementById('ai-input');
const submitButton = document.getElementById('submit-button');
const aiResponseOutput = document.getElementById('ai-response-output');
const loadingIndicator = document.getElementById('loading-indicator');

// --- Constants ---
/**
 * @constant {string} API_ENDPOINT - The backend API endpoint for generating AI responses.
 * @description Inferred backend endpoint. Assumes a POST request with a JSON body
 *              like `{ "prompt": "user input" }` and expects a JSON response
 *              like `{ "response": "AI generated text" }`.
 */
const API_ENDPOINT = '/api/generate-response';

// --- Helper Functions ---

/**
 * Displays a message in the response output area.
 * @param {string} message - The message to display.
 * @param {boolean} [isError=false] - True if the message is an error, false otherwise.
 */
function displayMessage(message, isError = false) {
    if (aiResponseOutput) {
        aiResponseOutput.textContent = message;
        aiResponseOutput.style.color = isError ? 'red' : 'inherit';
    }
}

/**
 * Toggles the visibility of a loading indicator and disables/enables interactive elements.
 * @param {boolean} show - True to show the indicator and disable elements, false to hide and enable.
 */
function toggleLoading(show) {
    if (loadingIndicator) {
        loadingIndicator.style.display = show ? 'block' : 'none';
    }
    if (submitButton) {
        submitButton.disabled = show;
    }
    if (aiInput) {
        aiInput.disabled = show;
    }
}

// --- Event Handlers ---

/**
 * Handles the submission of the AI query form.
 * Prevents default form submission and calls the backend API to get an AI response.
 * @param {Event} event - The submit event object.
 */
async function handleSubmit(event) {
    event.preventDefault(); // Prevent default form submission behavior

    // Basic check for critical DOM elements before proceeding
    if (!aiInput || !submitButton || !aiResponseOutput) {
        console.error('Critical DOM elements are missing for handleSubmit. Cannot process request.');
        displayMessage('Application error: Missing UI components. Please refresh.', true);
        return;
    }

    const prompt = aiInput.value.trim();
    if (!prompt) {
        displayMessage('Please enter a query.', true);
        return;
    }

    displayMessage(''); // Clear previous messages or responses
    toggleLoading(true); // Show loading indicator and disable inputs

    try {
        // Send a POST request to the backend API endpoint
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: prompt }), // Send the user's prompt as JSON
        });

        // Check if the HTTP response was successful
        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            try {
                // Attempt to parse error message from response body
                const errorData = await response.json();
                if (errorData && errorData.message) {
                    errorMessage = errorData.message;
                }
            } catch (jsonError) {
                console.warn('Could not parse error response JSON:', jsonError);
                // Fallback to generic message if JSON parsing fails
            }
            throw new Error(errorMessage);
        }

        // Parse the successful JSON response
        const data = await response.json();
        if (data && data.response) {
            displayMessage(data.response); // Display the AI-generated response
        } else {
            displayMessage('No valid response received from the AI service.', true);
        }

    } catch (error) {
        console.error('Error fetching AI response:', error);
        displayMessage(`Failed to get AI response: ${error.message}. Please try again.`, true);
    } finally {
        toggleLoading(false); // Hide loading indicator and re-enable inputs
    }
}

// --- Initialization ---

/**
 * Initializes the application by attaching event listeners once the DOM is fully loaded.
 * Ensures all required DOM elements are present before attaching listeners.
 */
function initializeApp() {
    // Check if all necessary DOM elements are available
    if (submitButton && aiInput && aiResponseOutput && loadingIndicator) {
        submitButton.addEventListener('click', handleSubmit);
        // Allow submitting the query by pressing Enter in the input field
        aiInput.addEventListener('keypress', (event) => {
            if (event.key === 'Enter') {
                handleSubmit(event);
            }
        });
        console.log('Frontend initialized: Event listeners attached.');
        // Optionally, hide loading indicator initially if it's visible by default in HTML/CSS
        toggleLoading(false);
    } else {
        console.error('Frontend initialization failed: Missing one or more required DOM elements.');
        // Provide a user-facing error message if critical elements are missing
        if (aiResponseOutput) {
            aiResponseOutput.textContent = 'Application failed to load properly. Some UI components are missing. Please check the browser console for details.';
            aiResponseOutput.style.color = 'red';
        } else {
            // Fallback for extremely critical cases where even output element is missing
            document.body.insertAdjacentHTML('afterbegin', '<p style="color:red;">Application failed to load. Please check console.</p>');
        }
    }
}

// Ensure the DOM is fully loaded before running initialization logic
document.addEventListener('DOMContentLoaded', initializeApp);