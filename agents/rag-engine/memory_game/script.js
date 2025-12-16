const cardSymbols = ['🍕', '🍔', '🍟', '🌭', '🍿', '🎂', '🍦', '🍩'];
let cards = [...cardSymbols, ...cardSymbols];
let flippedCards = [];
let matchedPairs = 0;
let moves = 0;
let startTime = null;
let timerInterval = null;

const gameBoard = document.getElementById('gameBoard');
const movesDisplay = document.getElementById('moves');
const matchesDisplay = document.getElementById('matches');
const timerDisplay = document.getElementById('timer');
const restartBtn = document.getElementById('restartBtn');
const winModal = document.getElementById('winModal');
const finalMoves = document.getElementById('finalMoves');
const finalTime = document.getElementById('finalTime');
const playAgainBtn = document.getElementById('playAgainBtn');

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function createCard(symbol, index) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.symbol = symbol;
    card.dataset.index = index;

    card.innerHTML = `
        <div class="card-front">?</div>
        <div class="card-back">${symbol}</div>
    `;

    card.addEventListener('click', flipCard);
    return card;
}

function initGame() {
    gameBoard.innerHTML = '';
    cards = shuffle([...cardSymbols, ...cardSymbols]);
    flippedCards = [];
    matchedPairs = 0;
    moves = 0;
    startTime = null;

    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }

    movesDisplay.textContent = '0';
    matchesDisplay.textContent = '0/8';
    timerDisplay.textContent = '00:00';

    cards.forEach((symbol, index) => {
        const card = createCard(symbol, index);
        gameBoard.appendChild(card);
    });
}

function flipCard() {
    if (flippedCards.length >= 2) return;
    if (this.classList.contains('flipped')) return;
    if (this.classList.contains('matched')) return;

    if (!startTime) {
        startTime = Date.now();
        startTimer();
    }

    this.classList.add('flipped');
    flippedCards.push(this);

    if (flippedCards.length === 2) {
        moves++;
        movesDisplay.textContent = moves;
        checkMatch();
    }
}

function checkMatch() {
    const [card1, card2] = flippedCards;
    const symbol1 = card1.dataset.symbol;
    const symbol2 = card2.dataset.symbol;

    if (symbol1 === symbol2) {
        card1.classList.add('matched');
        card2.classList.add('matched');
        matchedPairs++;
        matchesDisplay.textContent = `${matchedPairs}/8`;
        flippedCards = [];

        if (matchedPairs === 8) {
            setTimeout(showWinModal, 500);
        }
    } else {
        setTimeout(() => {
            card1.classList.remove('flipped');
            card2.classList.remove('flipped');
            flippedCards = [];
        }, 1000);
    }
}

function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function showWinModal() {
    clearInterval(timerInterval);
    finalMoves.textContent = moves;
    finalTime.textContent = timerDisplay.textContent;
    winModal.classList.remove('hidden');
}

function closeModal() {
    winModal.classList.add('hidden');
    initGame();
}

restartBtn.addEventListener('click', initGame);
playAgainBtn.addEventListener('click', closeModal);

// 初始化遊戲
initGame();
