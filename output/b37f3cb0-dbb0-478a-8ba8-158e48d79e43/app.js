/* Import necessary libraries */
const axios = require('axios');

// Define base URL for the operations API
const BASE_URL = 'http://localhost:3000';

// Function to perform arithmetic operation
async function performOperation(operation, operands) {
  try {
    // Make a POST request to the operations API with the operation and operands
    const response = await axios.post(`${BASE_URL}/operations`, {
      operation,
      operands
    });

    // If the response status is not 200, throw an error
    if (response.status !== 200) {
      throw new Error('An error occurred while performing the operation');
    }

    // Return the result of the operation
    return response.data.result;
  } catch (error) {
    // Log the error and rethrow it
    console.error('An error occurred:', error);
    throw error;
  }
}

// Event listener for arithmetic operation
document.querySelector('.arithmetic-operation').addEventListener('click', async (event) => {
  try {
    // Prevent the default form submission behavior
    event.preventDefault();

    // Get the operation and operands from the form
    const operation = document.querySelector('.operation').value;
    const operands = Array.from(document.querySelectorAll('.operand')).map(operand => Number(operand.value));

    // Perform the operation and display the result
    const result = await performOperation(operation, operands);
    document.querySelector('.result').textContent = `Result: ${result}`;
  } catch (error) {
    // Display an error message
    document.querySelector('.error').textContent = 'An error occurred while performing the operation. Please try again.';
  }
});