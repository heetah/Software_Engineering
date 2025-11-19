const api = require('./api');

// Define arithmetic operations
async function add(a, b) {
  // Check if input is a number
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments should be numbers');
  }
  return a + b;
}

async function subtract(a, b) {
  // Check if input is a number
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments should be numbers');
  }
  return a - b;
}

async function multiply(a, b) {
  // Check if input is a number
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments should be numbers');
  }
  return a * b;
}

async function divide(a, b) {
  // Check if input is a number
  if (typeof a !== 'number' || typeof b !== 'number') {
    throw new Error('Both arguments should be numbers');
  }
  // Check if divisor is zero
  if (b === 0) {
    throw new Error('Cannot divide by zero');
  }
  return a / b;
}

module.exports = { add, subtract, multiply, divide };