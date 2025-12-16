let playerScore = 0;
let computerScore = 0;

const choices = ['rock', 'paper', 'scissors'];
const choiceIcons = {
    rock: '✊',
    paper: '✋',
    scissors: '✌️'
};

const playerChoiceDisplay = document.getElementById('playerChoice');
const computerChoiceDisplay = document.getElementById('computerChoice');
const resultDisplay = document.getElementById('result');
const playerScoreDisplay = document.getElementById('playerScore');
const computerScoreDisplay = document.getElementById('computerScore');
const choiceButtons = document.querySelectorAll('.choice-btn');
const resetBtn = document.getElementById('resetBtn');

function getComputerChoice() {
    const randomIndex = Math.floor(Math.random() * choices.length);
    return choices[randomIndex];
}

function determineWinner(playerChoice, computerChoice) {
    if (playerChoice === computerChoice) {
        return 'draw';
    }

    if (
        (playerChoice === 'rock' && computerChoice === 'scissors') ||
        (playerChoice === 'paper' && computerChoice === 'rock') ||
        (playerChoice === 'scissors' && computerChoice === 'paper')
    ) {
        return 'win';
    }

    return 'lose';
}

function updateDisplay(playerChoice, computerChoice, result) {
    playerChoiceDisplay.textContent = choiceIcons[playerChoice];
    computerChoiceDisplay.textContent = choiceIcons[computerChoice];

    // 添加動畫
    playerChoiceDisplay.classList.add('animate');
    computerChoiceDisplay.classList.add('animate');

    setTimeout(() => {
        playerChoiceDisplay.classList.remove('animate');
        computerChoiceDisplay.classList.remove('animate');
    }, 500);

    resultDisplay.className = 'result';

    if (result === 'win') {
        resultDisplay.textContent = '你贏了！🎉';
        resultDisplay.classList.add('win');
        playerScore++;
    } else if (result === 'lose') {
        resultDisplay.textContent = '你輸了！😢';
        resultDisplay.classList.add('lose');
        computerScore++;
    } else {
        resultDisplay.textContent = '平手！🤝';
        resultDisplay.classList.add('draw');
    }

    playerScoreDisplay.textContent = playerScore;
    computerScoreDisplay.textContent = computerScore;

    saveScores();
}

function playGame(playerChoice) {
    const computerChoice = getComputerChoice();
    const result = determineWinner(playerChoice, computerChoice);
    updateDisplay(playerChoice, computerChoice, result);
}

function resetScores() {
    if (confirm('確定要重置分數嗎？')) {
        playerScore = 0;
        computerScore = 0;
        playerScoreDisplay.textContent = playerScore;
        computerScoreDisplay.textContent = computerScore;
        playerChoiceDisplay.textContent = '?';
        computerChoiceDisplay.textContent = '?';
        resultDisplay.className = 'result';
        resultDisplay.textContent = '選擇你的出拳！';
        saveScores();
    }
}

function saveScores() {
    localStorage.setItem('rpsPlayerScore', playerScore);
    localStorage.setItem('rpsComputerScore', computerScore);
}

function loadScores() {
    const savedPlayerScore = localStorage.getItem('rpsPlayerScore');
    const savedComputerScore = localStorage.getItem('rpsComputerScore');

    if (savedPlayerScore) {
        playerScore = parseInt(savedPlayerScore);
        playerScoreDisplay.textContent = playerScore;
    }

    if (savedComputerScore) {
        computerScore = parseInt(savedComputerScore);
        computerScoreDisplay.textContent = computerScore;
    }
}

choiceButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const choice = btn.getAttribute('data-choice');
        playGame(choice);
    });
});

resetBtn.addEventListener('click', resetScores);

// 載入儲存的分數
loadScores();
