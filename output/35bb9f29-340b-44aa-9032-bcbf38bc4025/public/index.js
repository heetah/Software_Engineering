// Main JavaScript file for arithmetic operations program

// DOM Elements
const displayElement = document.querySelector('#display');
const numberButtons = document.querySelectorAll('.number');
const operationButtons = document.querySelectorAll('.operation');
const clearButton = document.querySelector('#clear');
let firstOperand = '';
let secondOperand = '';
let currentOperation = null;

// Event Listeners
numberButtons.forEach(button => {
  button.addEventListener('click', handleNumberClick);
});

operationButtons.forEach(button => {
  button.addEventListener('click', handleOperationClick);
});

clearButton.addEventListener('click', handleClear);

/**
 * Handle number button click
 * @param {Event} event
 */
async function handleNumberClick(event) {
  const number = event.target.value;
  if (currentOperation === null) {
    firstOperand += number;
    updateDisplay(firstOperand);
  } else {
    secondOperand += number;
    updateDisplay(secondOperand);
  }
}

/**
 * Handle operation button click
 * @param {Event} event
 */
async function handleOperationClick(event) {
  if (firstOperand && secondOperand) {
    firstOperand = await calculate(firstOperand, secondOperand, currentOperation);
    secondOperand = '';
    updateDisplay(firstOperand);
  }
  currentOperation = event.target.value;
}

/**
 * Handle clear button click
 * @param {Event} event
 */
function handleClear(event) {
  firstOperand = '';
  secondOperand = '';
  currentOperation = null;
  updateDisplay('0');
}

/**
 * Perform calculation
 * @param {number} num1
 * @param {number} num2
 * @param {string} operation
 * @returns {Promise<number>}
 */
async function calculate(num1, num2, operation) {
  num1 = parseFloat(num1);
  num2 = parseFloat(num2);
  switch (operation) {
    case '+':
      return num1 + num2;
    case '-':
      return num1 - num2;
    case '*':
      return num1 * num2;
    case '/':
      if (num2 !== 0) {
        return num1 / num2;
      } else {
        handleError(new Error("Can't divide by zero"));
        return num1;
      }
    default:
      return num1;
  }
}

/**
 * Update display
 * @param {string} text
 */
function updateDisplay(text) {
  displayElement.textContent = text;
}

/**
 * Handle error
 * @param {Error} error
 */
function handleError(error) {
  alert(error.message);
}