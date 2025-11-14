// src/backend/services/openaiService.js
import { OpenAI } from 'openai';
import config from '../../config.js'; // Import the shared configuration

/**
 * @typedef {object} ChatMessage
 * @property {'system' | 'user' | 'assistant'} role - The role of the message sender.
 * @property {string} content - The content of the message.
 */

/**
 * @typedef {object} ChatCompletionOptions
 * @property {string} [model] - The model to use for the completion (defaults to config.openai.defaultModel).
 * @property {number} [temperature] - What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random.
 * @property {number} [maxTokens] - The maximum number of tokens to generate in the chat completion.
 */

/**
 * @typedef {object} ImageGenerationOptions
 * @property {string} [model] - The model to use for image generation (e.g., 'dall-e-2', 'dall-e-3'). Defaults to config.openai.imageModel or 'dall-e-2'.
 * @property {'256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792'} [size] - The size of the generated images. Defaults to config.openai.defaultImageSize or '1024x1024'.
 * @property {number} [n] - The number of images to generate. Must be between 1 and 10 for dall-e-2, and 1 for dall-e-3. Defaults to 1.
 * @property {'url' | 'b64_json'} [responseFormat] - The format in which the generated images are returned. Defaults to 'url'.
 * @property {'vivid' | 'natural'} [style] - The style of the generated images. Only available for dall-e-3.
 * @property {'standard' | 'hd'} [quality] - The quality of the image. Only available for dall-e-3.
 */

/**
 * Service for interacting with the OpenAI API.
 * Encapsulates API key management and common API calls.
 */
class OpenAIService {
  /**
   * @private
   * @type {OpenAI}
   */
  #openai;

  /**
   * Creates an instance of OpenAIService.
   * Initializes the OpenAI client with the API key from configuration.
   * @throws {Error} If OPENAI_API_KEY is not provided in the configuration.
   */
  constructor() {
    if (!config.openai || !config.openai.apiKey) {
      throw new Error('OPENAI_API_KEY is not configured. Please set it in your .env file or config.js.');
    }

    this.#openai = new OpenAI({
      apiKey: config.openai.apiKey,
      organization: config.openai.organizationId,
      timeout: config.openai.timeoutMs || 60000, // Default to 60 seconds
    });
    console.log('OpenAIService initialized with OpenAI client.');
  }

  /**
   * Handles common OpenAI API errors.
   * @private
   * @param {Error} error - The error object.
   * @param {string} methodName - The name of the method where the error occurred.
   * @throws {Error} A more specific error message.
   */
  #handleOpenAIError(error, methodName) {
    console.error(`Error in ${methodName}:`, error.message);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('OpenAI API Error Data:', error.response.data);
      console.error('OpenAI API Error Status:', error.response.status);
      throw new Error(`OpenAI API error (${methodName}): ${error.response.status} - ${error.response.data.error?.message || 'Unknown error'}`);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('OpenAI API No Response:', error.request);
      throw new Error(`No response received from OpenAI API during ${methodName}.`);
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Failed to make OpenAI API request (${methodName}): ${error.message}`);
    }
  }

  /**
   * Generates a chat completion using the OpenAI API.
   *
   * @param {ChatMessage[]} messages - An array of message objects representing the conversation history.
   * @param {ChatCompletionOptions} [options={}] - Optional parameters for the completion request.
   * @returns {Promise<string>} The content of the assistant's reply.
   * @throws {Error} If the API call fails or returns an unexpected response.
   */
  async createChatCompletion(messages, options = {}) {
    try {
      const model = options.model || config.openai.defaultModel || 'gpt-3.5-turbo';
      console.log(`Requesting chat completion with model: ${model}`);
      // console.log('Messages:', messages); // Uncomment for detailed logging

      const completion = await this.#openai.chat.completions.create({
        model: model,
        messages: messages,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        max_tokens: options.maxTokens,
        // n: 1, // Number of chat completion choices to generate for each input message.
        // stop: ['\n'], // Up to 4 sequences where the API will stop generating further tokens.
        // stream: false, // If set, partial message deltas will be sent, like in ChatGPT.
      });

      if (completion.choices && completion.choices.length > 0) {
        const assistantMessage = completion.choices[0].message;
        if (!assistantMessage || !assistantMessage.content) {
          throw new Error('Received an empty or malformed message from OpenAI API.');
        }
        console.log('Received chat completion (first 100 chars):', assistantMessage.content.substring(0, 100) + '...');
        return assistantMessage.content;
      } else {
        throw new Error('No completion choices received from OpenAI API.');
      }
    } catch (error) {
      this.#handleOpenAIError(error, 'createChatCompletion');
    }
  }

  /**
   * Generates text completion (legacy method, consider using chat completions for new projects).
   *
   * @param {string} prompt - The prompt to generate text from.
   * @param {object} [options={}] - Optional parameters like model, temperature, maxTokens.
   * @returns {Promise<string>} The generated text.
   * @throws {Error} If the API call fails.
   */
  async createCompletion(prompt, options = {}) {
    try {
      const model = options.model || 'text-davinci-003'; // A common legacy completion model
      console.log(`Requesting text completion with model: ${model}`);
      // console.log('Prompt:', prompt); // Uncomment for detailed logging

      const completion = await this.#openai.completions.create({
        model: model,
        prompt: prompt,
        temperature: options.temperature !== undefined ? options.temperature : 0.7,
        max_tokens: options.maxTokens || 150,
      });

      if (completion.choices && completion.choices.length > 0) {
        const generatedText = completion.choices[0].text.trim();
        console.log('Received text completion (first 100 chars):', generatedText.substring(0, 100) + '...');
        return generatedText;
      } else {
        throw new Error('No completion choices received from OpenAI API.');
      }
    } catch (error) {
      this.#handleOpenAIError(error, 'createCompletion');
    }
  }

  /**
   * Generates a vector embedding for a given text input.
   * Embeddings can be used for tasks like semantic search, clustering, or recommendations.
   *
   * @param {string | string[]} input - The text to embed. Can be a single string or an array of strings.
   * @param {string} [model] - The model to use for embedding (defaults to config.openai.embeddingModel or 'text-embedding-ada-002').
   * @returns {Promise<number[]> | Promise<number[][]>} A promise that resolves to an array of floats (for single input) or an array of arrays of floats (for multiple inputs).
   * @throws {Error} If the API call fails.
   */
  async createEmbedding(input, model = config.openai.embeddingModel || 'text-embedding-ada-002') {
    if (!input || (Array.isArray(input) && input.length === 0)) {
      throw new Error('Input text for embedding cannot be empty.');
    }

    try {
      console.log(`Requesting embedding with model: ${model}`);
      // console.log('Embedding input (first 100 chars):', (Array.isArray(input) ? input[0] : input).substring(0, 100) + '...');

      const embeddingResponse = await this.#openai.embeddings.create({
        model: model,
        input: input,
      });

      if (embeddingResponse.data && embeddingResponse.data.length > 0) {
        // Return the embedding vector(s)
        const embeddings = embeddingResponse.data.map(item => item.embedding);
        console.log(`Received ${embeddings.length} embedding(s) of dimension ${embeddings[0]?.length}.`);
        return Array.isArray(input) ? embeddings : embeddings[0];
      } else {
        throw new Error('No embedding data received from OpenAI API.');
      }
    } catch (error) {
      this.#handleOpenAIError(error, 'createEmbedding');
    }
  }

  /**
   * Generates an image from a text prompt using DALL-E.
   *
   * @param {string} prompt - A text description of the desired image(s). The maximum length is 1000 characters for dall-e-2 and 4000 characters for dall-e-3.
   * @param {ImageGenerationOptions} [options={}] - Optional parameters for image generation.
   * @returns {Promise<string[]>} A promise that resolves to an array of URLs or base64 encoded strings of the generated images.
   * @throws {Error} If the API call fails.
   */
  async createImage(prompt, options = {}) {
    if (!prompt) {
      throw new Error('Prompt for image generation cannot be empty.');
    }

    try {
      const model = options.model || config.openai.imageModel || 'dall-e-2';
      const size = options.size || config.openai.defaultImageSize || '1024x1024';
      const n = options.n || 1;
      const responseFormat = options.responseFormat || 'url';

      console.log(`Requesting image generation with model: ${model}, size: ${size}, n: ${n}`);
      // console.log('Image prompt:', prompt);

      const imageResponse = await this.#openai.images.generate({
        model: model,
        prompt: prompt,
        n: n,
        size: size,
        response_format: responseFormat,
        // DALL-E 3 specific options
        quality: model === 'dall-e-3' ? (options.quality || 'standard') : undefined,
        style: model === 'dall-e-3' ? (options.style || 'vivid') : undefined,
      });

      if (imageResponse.data && imageResponse.data.length > 0) {
        const imageUrls = imageResponse.data.map(item => item[responseFormat]);
        console.log(`Received ${imageUrls.length} image(s).`);
        return imageUrls;
      } else {
        throw new Error('No image data received from OpenAI API.');
      }
    } catch (error) {
      this.#handleOpenAIError(error, 'createImage');
    }
  }

  /**
   * Creates an audio transcription from an audio file.
   *
   * @param {Buffer | ReadableStream} audioFile - The audio file to transcribe. Must be in a supported format (mp3, mp4, mpeg, mpga, m4a, wav, webm).
   * @param {string} [language] - The language of the input audio. Supplying the input language in ISO-639-1 format will improve accuracy and latency.
   * @param {string} [model] - The model to use for transcription (defaults to 'whisper-1').
   * @returns {Promise<string>} The transcribed text.
   * @throws {Error} If the API call fails or the audio file is invalid.
   */
  async createTranscription(audioFile, language, model = 'whisper-1') {
    if (!audioFile) {
      throw new Error('Audio file for transcription cannot be empty.');
    }

    try {
      console.log(`Requesting audio transcription with model: ${model}`);

      // The OpenAI Node.js library expects a File object or a ReadStream for audio files.
      // If audioFile is a Buffer, we need to convert it to a Blob or a stream.
      // For simplicity here, assuming a Node.js environment where fs.createReadStream or Blob works.
      // If audioFile is already a stream/file-like object, it can be passed directly.
      let fileToSend = audioFile;
      if (Buffer.isBuffer(audioFile)) {
        // A common way to handle buffers for API calls is to convert to a Blob
        // or write to a temporary file and create a stream.
        // For direct API calls, the 'openai' library often handles Buffer if named correctly.
        // Let's assume the buffer needs to be treated as a file.
        // This might require a 'file-type' package or knowing the type.
        // For now, let's assume it's a simple buffer and the API can infer.
        // A more robust solution might involve `new File([audioFile], 'audio.mp3', { type: 'audio/mp3' })`
        // but that requires browser-like File API or a polyfill.
        // For a backend service, a temporary file or direct stream is more common.
        // Let's create a dummy file object for the API.
        fileToSend = new Blob([audioFile], { type: 'audio/mpeg' }); // Assuming mp3, adjust type as needed
        fileToSend.name = 'audio.mp3'; // Required by OpenAI API for file uploads
      } else if (typeof audioFile === 'object' && audioFile.path) {
        // If it's a file object with a path (e.g., from multer)
        // fileToSend = fs.createReadStream(audioFile.path); // Requires 'fs' module
        // For simplicity, directly passing it if it's already a suitable object
        // The OpenAI library typically expects a Blob or a Node.js ReadStream
      }


      const transcription = await this.#openai.audio.transcriptions.create({
        file: fileToSend,
        model: model,
        language: language, // Optional
        // response_format: 'json', // or 'text', 'srt', 'verbose_json', 'vtt'
        // temperature: 0, // Higher values increase randomness
      });

      if (transcription && transcription.text) {
        console.log('Received audio transcription (first 100 chars):', transcription.text.substring(0, 100) + '...');
        return transcription.text;
      } else {
        throw new Error('No transcription text received from OpenAI API.');
      }
    } catch (error) {
      this.#handleOpenAIError(error, 'createTranscription');
    }
  }
}

export default new OpenAIService(); // Export a singleton instance