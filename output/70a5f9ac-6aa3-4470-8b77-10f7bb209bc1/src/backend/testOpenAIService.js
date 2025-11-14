// src/backend/testOpenAIService.js
import openaiService from './services/openaiService.js'; // Import the service instance
import config from '../config.js'; // Import config to check environment or specific settings

/**
 * Main function to run tests for the OpenAI service.
 * This function orchestrates various test cases to verify the functionality
 * of the openaiService, including chat completions, legacy text completions,
 * and error handling.
 */
async function runOpenAIServiceTests() {
  console.log('--- Starting OpenAI Service Tests ---');

  // Ensure API key is available before running any tests that require it.
  // This prevents unnecessary API calls and provides immediate feedback.
  if (!config.openai || !config.openai.apiKey) {
    console.error('Error: OpenAI API Key is not configured. Please check your .env file and config.js.');
    console.error('Skipping OpenAI service tests.');
    return;
  }

  // Test Case 1: Basic Chat Completion
  // Verifies the ability to send a simple chat message and receive a response.
  console.log('\n--- Test Case 1: Basic Chat Completion ---');
  try {
    const chatMessages = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' },
    ];
    console.log('Sending chat completion request...');
    const chatResponse = await openaiService.createChatCompletion(chatMessages, {
      temperature: 0.5,
      maxTokens: 50,
      model: 'gpt-3.5-turbo', // Explicitly specify a common model for reliability
    });
    console.log('Chat Completion Test Passed. Response received.');
    if (chatResponse && chatResponse.choices && chatResponse.choices.length > 0) {
      console.log('Assistant\'s reply:', chatResponse.choices[0].message.content.trim());
    } else {
      console.warn('Chat Completion Test Passed, but no choices found in response.');
    }
  } catch (error) {
    console.error('Chat Completion Test Failed:', error.message);
    if (error.response) {
      console.error('API Error Details:', error.response.status, error.response.data);
    }
  }

  // Test Case 2: Chat Completion with a different prompt and model options
  // Demonstrates flexibility in prompt and model parameters.
  console.log('\n--- Test Case 2: Another Chat Completion ---');
  try {
    const chatMessages = [
      { role: 'user', content: 'Tell me a short, funny story about a cat.' },
    ];
    console.log('Sending another chat completion request...');
    const chatResponse = await openaiService.createChatCompletion(chatMessages, {
      model: 'gpt-3.5-turbo', // Explicitly specify model
      temperature: 0.8, // Higher temperature for more creative responses
      maxTokens: 100,
    });
    console.log('Another Chat Completion Test Passed. Response received.');
    if (chatResponse && chatResponse.choices && chatResponse.choices.length > 0) {
      console.log('Assistant\'s story:', chatResponse.choices[0].message.content.trim());
    } else {
      console.warn('Another Chat Completion Test Passed, but no choices found in response.');
    }
  } catch (error) {
    console.error('Another Chat Completion Test Failed:', error.message);
    if (error.response) {
      console.error('API Error Details:', error.response.status, error.response.data);
    }
  }

  // Test Case 3: Text Completion (Legacy)
  // Note: text-davinci-003 and similar models are deprecated.
  // This test is included for compatibility with older implementations of openaiService
  // that might still expose a `createCompletion` method for legacy models.
  // For new projects, prefer chat completions.
  console.log('\n--- Test Case 3: Text Completion (Legacy) ---');
  try {
    // Check if the legacy completion method exists before attempting to call it.
    if (typeof openaiService.createCompletion === 'function') {
      const textPrompt = 'Write a tagline for a coffee shop called "Bean There, Done That".';
      console.log('Sending legacy text completion request...');
      const textResponse = await openaiService.createCompletion(textPrompt, {
        model: 'text-davinci-003', // Use a legacy model if supported by the service
        temperature: 0.7,
        maxTokens: 30,
      });
      console.log('Text Completion Test Passed. Response received.');
      if (textResponse && textResponse.choices && textResponse.choices.length > 0) {
        console.log('Generated tagline:', textResponse.choices[0].text.trim());
      } else {
        console.warn('Text Completion Test Passed, but no choices found in response.');
      }
    } else {
      console.log('Skipping Legacy Text Completion Test: openaiService.createCompletion method not found or not implemented.');
    }
  } catch (error) {
    console.error('Text Completion Test Failed:', error.message);
    if (error.response) {
      console.error('API Error Details:', error.response.status, error.response.data);
    }
    console.warn('Note: Legacy text completion models like text-davinci-003 are deprecated. Consider migrating to chat completion models.');
  }

  // Test Case 4: Error Handling (e.g., invalid model)
  // This test is designed to explicitly trigger an error from the OpenAI API
  // by using a non-existent model name, verifying that the service correctly
  // catches and propagates the error.
  console.log('\n--- Test Case 4: Error Handling (Invalid Model) ---');
  try {
    const chatMessages = [
      { role: 'user', content: 'This should fail due to an invalid model.' },
    ];
    console.log('Attempting chat completion with an invalid model...');
    // Using a non-existent model to trigger an error
    await openaiService.createChatCompletion(chatMessages, { model: 'non-existent-model-123-abc' });
    // If we reach here, the test failed because an error was expected but not thrown.
    console.error('Error Handling Test Failed: Expected an error but got a response.');
  } catch (error) {
    // This is the expected path for a successful error handling test.
    console.log('Error Handling Test Passed. Expected error caught:', error.message);
    if (error.response) {
      console.log('API Error Status:', error.response.status);
      console.log('API Error Data:', error.response.data);
      // Check for specific error codes or messages if possible
      if (error.response.status === 404 || error.response.data?.error?.code === 'model_not_found') {
        console.log('Confirmed: Model not found error received as expected.');
      }
    }
  }

  console.log('\n--- Finished OpenAI Service Tests ---');
}

// Execute the tests when this script is run.
// This makes the file directly executable for testing purposes.
runOpenAIServiceTests();