// src/utils/openaiClient.js
import OpenAI from 'openai';
import config from '../../config.js'; // Reference to root config.js

/**
 * @typedef {object} ChatCompletionMessage
 * @property {string} role - The role of the author of this message (e.g., 'user', 'assistant', 'system').
 * @property {string} content - The contents of the message.
 */

/**
 * Initializes and provides an OpenAI API client instance.
 * Ensures the API key is configured before creating the client.
 */
class OpenAIClient {
  /**
   * The OpenAI API client instance.
   * @private
   * @type {OpenAI | null}
   */
  #client = null;

  constructor() {
    // Ensure the OpenAI API key is provided in the configuration.
    if (!config.openaiApiKey) {
      throw new Error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file or config.js.');
    }
    // Initialize the OpenAI client with the API key.
    this.#client = new OpenAI({
      apiKey: config.openaiApiKey,
      // Optionally, you can add other configurations here, e.g., `baseURL` for custom endpoints.
    });
  }

  /**
   * Returns the initialized OpenAI client instance.
   * @returns {OpenAI} The OpenAI client.
   * @throws {Error} If the client has not been initialized (e.g., due to missing API key).
   */
  getClient() {
    if (!this.#client) {
      throw new Error('OpenAI client is not initialized. This should not happen if the constructor ran successfully.');
    }
    return this.#client;
  }

  /**
   * Sends a chat completion request to the OpenAI API.
   * @param {ChatCompletionMessage[]} messages - An array of message objects representing the conversation history.
   * @param {string} [model='gpt-3.5-turbo'] - The model to use for the completion (e.g., 'gpt-4', 'gpt-3.5-turbo').
   * @param {object} [options={}] - Additional options for the chat completion (e.g., temperature, max_tokens, top_p).
   * @returns {Promise<import('openai').Chat.Completions.ChatCompletion>} A promise that resolves to the chat completion response object.
   * @throws {Error} If the API call fails, the client is not initialized, or input is invalid.
   */
  async getChatCompletion(messages, model = 'gpt-3.5-turbo', options = {}) {
    if (!this.#client) {
      throw new Error('OpenAI client is not initialized. Check API key configuration.');
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array cannot be empty for chat completion.');
    }

    try {
      const completion = await this.#client.chat.completions.create({
        model: model,
        messages: messages,
        ...options, // Spread additional options like temperature, max_tokens, etc.
      });
      return completion;
    } catch (error) {
      // Log the detailed error for debugging purposes.
      console.error('Error getting chat completion:', error.message || error);
      // Re-throw a more generic, user-friendly error message.
      throw new Error(`Failed to get chat completion from OpenAI API: ${error.message || 'Unknown error occurred.'}`);
    }
  }

  /**
   * Generates an embedding for the given text using the OpenAI API.
   * @param {string | string[]} text - The text or array of texts to embed.
   * @param {string} [model='text-embedding-3-small'] - The model to use for generating the embedding.
   * @param {object} [options={}] - Additional options for the embedding request (e.g., dimensions).
   * @returns {Promise<import('openai').Embeddings.Embedding[] | null>} A promise that resolves to an array of embedding objects, or null if no embedding data is returned.
   *                                                                     Each object contains `embedding` (array of numbers), `index`, and `object` properties.
   * @throws {Error} If the API call fails, the client is not initialized, or input is invalid.
   */
  async getEmbedding(text, model = 'text-embedding-3-small', options = {}) {
    if (!this.#client) {
      throw new Error('OpenAI client is not initialized. Check API key configuration.');
    }
    if (!text || (Array.isArray(text) && text.length === 0) || (typeof text !== 'string' && !Array.isArray(text))) {
      throw new Error('Text input for embedding must be a non-empty string or array of strings.');
    }

    try {
      const embeddingResponse = await this.#client.embeddings.create({
        model: model,
        input: text,
        ...options, // Spread additional options like dimensions
      });

      // The response structure is { data: [{ embedding: [...], index: 0, object: 'embedding' }], model: '...', usage: {...} }
      // We are interested in the 'data' array which contains the actual embedding objects.
      if (embeddingResponse && embeddingResponse.data && embeddingResponse.data.length > 0) {
        return embeddingResponse.data;
      }
      // If no data is returned, it might indicate an issue or an empty result,
      // depending on the API behavior for certain inputs. Returning null is a valid way to signal this.
      return null;
    } catch (error) {
      // Log the detailed error for debugging purposes.
      console.error('Error getting embedding:', error.message || error);
      // Re-throw a more generic, user-friendly error message.
      throw new Error(`Failed to get embedding from OpenAI API: ${error.message || 'Unknown error occurred.'}`);
    }
  }

  // Add more methods for other OpenAI API interactions as needed, for example:
  // async getImageGeneration(prompt, options = {}) {
  //   if (!this.#client) { throw new Error('OpenAI client not initialized.'); }
  //   try {
  //     const response = await this.#client.images.generate({
  //       prompt: prompt,
  //       ...options,
  //     });
  //     return response.data;
  //   } catch (error) {
  //     console.error('Error generating image:', error.message || error);
  //     throw new Error(`Failed to generate image from OpenAI API: ${error.message || 'Unknown error occurred.'}`);
  //   }
  // }
}

// Export a singleton instance of the client.
// This ensures that only one instance of the OpenAI client is created and reused throughout the application,
// preventing redundant API key checks and resource allocation.
const openaiClient = new OpenAIClient();
export default openaiClient;