const difficultySettings = {
    easy: { range: 50, attempts: 10 },
    medium: { range: 100, attempts: 10 },
    hard: { range: 200, attempts: 12 }
};

let targetNumber;
let maxNumber;
let attemptsLeft;
let guessHistory = [];
let bestScore = localStorage.getItem('bestScore') || null;

const difficultySelect = document.getElementById('difficulty');
const instructionElement = document.getElementById('instruction');
const attemptsLeftElement = document.getElementById('attemptsLeft');
const bestScoreElement = document.getElementById('bestScore');
const guessInput = document.getElementById('guessInput');
const guessBtn = document.getElementById('guessBtn');
const feedbackElement = document.getElementById('feedback');
const historyList = document.getElementById('historyList');
const resetBtn = document.getElementById('resetBtn');

function initGame() {
    const difficulty = difficultySelect.value;
    const settings = difficultySettings[difficulty];

    maxNumber = settings.range;
    attemptsLeft = settings.attempts;
    targetNumber = Math.floor(Math.random() * maxNumber) + 1;
    guessHistory = [];

    instructionElement.textContent = `我想了一個 1 到 ${maxNumber} 之間的數字，你能猜到嗎？`;
    attemptsLeftElement.textContent = attemptsLeft;
    guessInput.value = '';
    guessInput.max = maxNumber;
    guessInput.disabled = false;
    guessBtn.disabled = false;
    feedbackElement.textContent = '';
    feedbackElement.className = 'feedback';
    historyList.innerHTML = '';

    if (bestScore) {
        bestScoreElement.textContent = bestScore;
    }
}

function makeGuess() {
    const guess = parseInt(guessInput.value);

    if (!guess || guess < 1 || guess > maxNumber) {
        showFeedback(`請輸入 1 到 ${maxNumber} 之間的數字`, 'wrong');
        return;
    }

    attemptsLeft--;
    attemptsLeftElement.textContent = attemptsLeft;

    addToHistory(guess);

    if (guess === targetNumber) {
        const usedAttempts = difficultySettings[difficultySelect.value].attempts - attemptsLeft;
        showFeedback(`🎉 恭喜！你猜對了！用了 ${usedAttempts} 次`, 'correct');
        guessInput.disabled = true;
        guessBtn.disabled = true;

        if (!bestScore || usedAttempts < bestScore) {
            bestScore = usedAttempts;
            localStorage.setItem('bestScore', bestScore);
            bestScoreElement.textContent = bestScore;
        }
    } else if (attemptsLeft === 0) {
        showFeedback(`😢 遊戲結束！答案是 ${targetNumber}`, 'wrong');
        guessInput.disabled = true;
        guessBtn.disabled = true;
    } else if (guess > targetNumber) {
        showFeedback('太高了！試試更小的數字', 'too-high');
    } else {
        showFeedback('太低了！試試更大的數字', 'too-low');
    }

    guessInput.value = '';
    guessInput.focus();
}

function showFeedback(message, type) {
    feedbackElement.textContent = message;
    feedbackElement.className = `feedback ${type}`;
}

function addToHistory(guess) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.textContent = guess;

    if (guess > targetNumber) {
        item.classList.add('too-high');
    } else if (guess < targetNumber) {
        item.classList.add('too-low');
    }

    historyList.appendChild(item);
    guessHistory.push(guess);
}

guessBtn.addEventListener('click', makeGuess);
guessInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') makeGuess();
});
resetBtn.addEventListener('click', initGame);
difficultySelect.addEventListener('change', initGame);

initGame();
