// src/main.js
import config from '../config.js'; // Reference to root config.js
import openaiClient from './utils/openaiClient.js';

/**
 * The main entry point for the application.
 * Initializes the environment and demonstrates basic OpenAI API interaction.
 */
async function main() {
  console.log(`Application running in ${config.nodeEnv} environment.`);

  // --- Configuration Validation ---
  // Ensure the OpenAI API key is present before attempting any API calls.
  if (!config.openaiApiKey) {
    console.error('Error: OpenAI API Key is not configured.');
    console.error('Please ensure OPENAI_API_KEY is set in your .env file or directly in config.js.');
    process.exit(1); // Exit early if a critical configuration is missing
  }
  console.log('OpenAI API Key is configured successfully.');

  // Example: Get a simple chat completion
  try {
    const messages = [
      { role: 'system', content: 'You are a helpful AI assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ];

    console.log('\nSending request for chat completion to OpenAI API...');
    console.log('Request messages:', JSON.stringify(messages));

    // Await the completion from the OpenAI client
    const completion = await openaiClient.getChatCompletion(messages, 'gpt-3.5-turbo');

    // --- Response Handling and Validation ---
    if (completion && completion.choices && completion.choices.length > 0) {
      const assistantMessage = completion.choices[0].message;
      console.log('Received chat completion response.');
      console.log('Assistant:', assistantMessage.content);
      // Optionally log full completion object for debugging
      // console.log('Full completion object:', JSON.stringify(completion, null, 2));
    } else {
      // Log if the API returned a response, but it didn't contain valid choices
      console.warn('No valid completion choices received from OpenAI API.');
      console.warn('Raw completion object:', JSON.stringify(completion, null, 2));
    }
  } catch (error) {
    // --- Detailed Error Handling for OpenAI API Interactions ---
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Failed to interact with OpenAI API (HTTP Error):');
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      // The request was made but no response was received
      // `error.request` is an instance of XMLHttpRequest in the browser and an http.ClientRequest in node.js
      console.error('Failed to interact with OpenAI API (No Response):');
      console.error('Request details:', error.request);
      console.error('Error message:', error.message);
    } else {
      // Something else happened while setting up the request that triggered an Error
      console.error('Failed to interact with OpenAI API (General Error):');
      console.error('Error message:', error.message);
    }
    // Re-throw the error to be caught by the main().catch block for consistent exit handling
    throw error;
  }

  console.log('\nApplication finished.');
}

// Execute the main function and catch any unhandled errors.
// This ensures that any promise rejections not caught within `main`
// are handled gracefully, and the process exits with a non-zero code.
main().catch(error => {
  console.error('Unhandled critical error in main application:', error);
  // In a production environment, you might want to integrate with a monitoring
  // or error reporting service (e.g., Sentry, New Relic) here.
  process.exit(1); // Exit with a non-zero code to indicate an error
});