const axios = require('axios');
const config = require('./config');

// Function for making API calls to OpenAI
async function callOpenAI(input) {
  // Check if the input is valid
  if (!input) {
    throw new Error('Input cannot be empty');
  }

  // Define the request parameters
  const params = {
    prompt: input,
    max_tokens: 60
  };

  // Define the request headers
  const headers = {
    'Authorization': `Bearer ${config.openai_key}`
  };

  try {
    // Send a POST request to the OpenAI API
    const response = await axios.post('https://api.openai.com/v1/engines/davinci-codex/completions', params, { headers });

    // Check if the response is valid
    if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].text) {
      throw new Error('Invalid response from OpenAI');
    }

    // Return the text from the first choice in the response
    return response.data.choices[0].text;
  } catch (error) {
    // Handle any errors that occur during the API call
    console.error(`Error calling OpenAI: ${error.message}`);
    throw error;
  }
}

module.exports = { callOpenAI };