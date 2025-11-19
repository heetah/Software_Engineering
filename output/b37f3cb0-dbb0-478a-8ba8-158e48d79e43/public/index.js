// Main JavaScript file for arithmetic operations program

// DOM Selectors
const display = document.querySelector('#display');
const numButtons = document.querySelectorAll('.num-button');
const opButtons = document.querySelectorAll('.op-button');
const clearButton = document.querySelector('#clear-button');
let num1 = '';
let num2 = '';
let operator = '';

// Event Listeners
numButtons.forEach(button => {
  button.addEventListener('click', handleNumClick);
});

opButtons.forEach(button => {
  button.addEventListener('click', handleOpClick);
});

clearButton.addEventListener('click', handleClear);

// Event Handlers
async function handleNumClick(event) {
  // Update display based on button click
  if (!operator) {
    num1 += event.target.innerText;
    updateDisplay(num1);
  } else {
    num2 += event.target.innerText;
    updateDisplay(num2);
  }
}

async function handleOpClick(event) {
  // Perform calculation based on operator
  if (num1 && num2) {
    const result = await performCalculation(num1, operator, num2);
    updateDisplay(result);
    num1 = result;
    num2 = '';
  }
  operator = event.target.innerText;
}

function handleClear(event) {
  // Clear the display
  num1 = '';
  num2 = '';
  operator = '';
  updateDisplay('');
}

// Helper Functions
async function performCalculation(num1, operator, num2) {
  // Call OpenAI API to perform calculation
  try {
    const response = await fetch('https://api.openai.com/v1/engines/davinci/codex/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_OPEN_AI_KEY'
      },
      body: JSON.stringify({
        'prompt': `${num1} ${operator} ${num2}`,
        'max_tokens': 5
      })
    });

    const data = await response.json();
    return data.choices[0].text.trim();
  } catch (error) {
    handleError(error);
  }
}

function updateDisplay(value) {
  // Update the display with the given value
  display.innerText = value;
}

function handleError(error) {
  // Handle any errors
  console.error('An error occurred:', error);
  display.innerText = 'Error';
}