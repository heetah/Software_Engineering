// src/architect_agent.js
// This script initializes the Architect Agent, loads configuration,
// and sets up the OpenAI client for interaction.

// Core Node.js modules
import path from 'path';
import { fileURLToPath } from 'url';

// Third-party dependencies
import dotenv from 'dotenv';
import OpenAI from 'openai';

// Application configuration
import config from '../config.js';

// Resolve __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
// This must be called before any module that directly accesses process.env
// if those variables are defined only in .env.
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * @typedef {Object} AgentResponse
 * @property {string} proposalId - Unique identifier for the generated proposal.
 * @property {string} architectureDescription - Detailed description of the proposed architecture.
 * @property {string[]} recommendedTechnologies - List of recommended technologies.
 * @property {string[]} potentialChallenges - List of potential challenges.
 */

/**
 * Initializes the OpenAI client using the API key from the configuration.
 * @returns {OpenAI} An initialized OpenAI client instance.
 */
function initializeOpenAIClient() {
  if (!config.openaiApiKey || config.openaiApiKey === 'your_default_openai_api_key_here') {
    console.error('CRITICAL ERROR: OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file or config.js.');
    process.exit(1); // Exit if critical configuration is missing
  }
  console.log(`Initializing OpenAI client for environment: ${config.nodeEnv}`);
  return new OpenAI({
    apiKey: config.openaiApiKey,
  });
}

const openai = initializeOpenAIClient();

/**
 * Generates an architectural proposal based on a given prompt using OpenAI's GPT model.
 * The model is instructed to return a JSON object conforming to a specific structure.
 * @param {string} projectDescription - A detailed description of the project requirements.
 * @returns {Promise<AgentResponse>} A promise that resolves to an AgentResponse object.
 * @throws {Error} If the OpenAI API call fails or the response cannot be parsed.
 */
async function generateArchitectureProposal(projectDescription) {
  console.log(`Generating architecture proposal for: "${projectDescription.substring(0, Math.min(projectDescription.length, 50))}..."`);
  try {
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o", // Or another suitable model like "gpt-3.5-turbo"
      messages: [
        { role: "system", content: "You are an expert software architect. Your task is to design robust, scalable, and maintainable software architectures. Provide your response as a JSON object with keys: architectureDescription (string), recommendedTechnologies (array of strings), and potentialChallenges (array of strings)." },
        { role: "user", content: `Design a software architecture for the following project: ${projectDescription}.` }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: "json_object" } // Request JSON output from the model
    });

    const rawResponse = chatCompletion.choices[0].message.content;
    if (!rawResponse) {
      throw new Error("OpenAI response content was empty.");
    }

    // Inferred structure for the AI's JSON response (expected from system prompt)
    /**
     * @typedef {Object} OpenAIArchitectureResponse
     * @property {string} architectureDescription
     * @property {string[]} recommendedTechnologies
     * @property {string[]} potentialChallenges
     */
    const parsedResponse = JSON.parse(rawResponse);

    // Validate and map AI response to AgentResponse type
    const agentResponse = {
      proposalId: `arch-prop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`, // Simple unique ID
      architectureDescription: parsedResponse.architectureDescription || 'No description provided.',
      recommendedTechnologies: Array.isArray(parsedResponse.recommendedTechnologies) ? parsedResponse.recommendedTechnologies : [],
      potentialChallenges: Array.isArray(parsedResponse.potentialChallenges) ? parsedResponse.potentialChallenges : [],
    };

    return agentResponse;

  } catch (error) {
    console.error('Error generating architecture proposal:', error);
    // Re-throw or return a structured error response for upstream handling
    throw new Error(`Failed to generate architecture proposal: ${error.message}`);
  }
}

/**
 * Main entry point for the Architect Agent script.
 * Demonstrates how to use the agent by generating a sample proposal.
 */
async function main() {
  console.log('Architect Agent started.');

  const exampleProjectDescription = `
    Build a real-time chat application with end-to-end encryption,
    supporting millions of concurrent users, group chats, and file sharing.
    It should have web, iOS, and Android clients, and integrate with a third-party payment gateway.
  `;

  try {
    const proposal = await generateArchitectureProposal(exampleProjectDescription);
    console.log('\n--- Architecture Proposal ---');
    console.log('Proposal ID:', proposal.proposalId);
    console.log('Description:', proposal.architectureDescription.substring(0, Math.min(proposal.architectureDescription.length, 500)) + (proposal.architectureDescription.length > 500 ? '...' : '')); // Truncate for display
    console.log('Recommended Technologies:', proposal.recommendedTechnologies.join(', ') || 'None specified.');
    console.log('Potential Challenges:', proposal.potentialChallenges.join(', ') || 'None specified.');
  } catch (error) {
    console.error('Agent encountered an error:', error.message);
  }

  console.log('Architect Agent finished.');
}

// Execute the main function when the script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export functions and client for potential testing or modular use
export {
  initializeOpenAIClient,
  generateArchitectureProposal,
  openai, // Export the client for direct access if needed
};


// Generated with mock API for src/architect_agent.js
