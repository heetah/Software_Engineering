// Game state
let board = ['', '', '', '', '', '', '', '', ''];
let currentPlayer = 'X';
let gameActive = true;
let scores = {
    X: parseInt(localStorage.getItem('tttScoreX')) || 0,
    O: parseInt(localStorage.getItem('tttScoreO')) || 0,
    draw: parseInt(localStorage.getItem('tttScoreDraw')) || 0
};

// Winning combinations
const winningCombinations = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
    [0, 4, 8], [2, 4, 6]             // Diagonals
];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateScoreboard();
});

// Make move
function makeMove(index) {
    if (!gameActive || board[index] !== '') {
        return;
    }

    board[index] = currentPlayer;
    const cell = document.querySelector(`.cell[data-index="${index}"]`);
    cell.textContent = currentPlayer;
    cell.classList.add(currentPlayer.toLowerCase(), 'taken');

    if (checkWin()) {
        endGame(`Player ${currentPlayer} Wins!`);
        scores[currentPlayer]++;
        updateScores();
        highlightWinningCells();
    } else if (checkDraw()) {
        endGame("It's a Draw!");
        scores.draw++;
        updateScores();
    } else {
        switchPlayer();
    }
}

// Check for win
function checkWin() {
    return winningCombinations.some(combination => {
        return combination.every(index => {
            return board[index] === currentPlayer;
        });
    });
}

// Check for draw
function checkDraw() {
    return board.every(cell => cell !== '');
}

// Highlight winning cells
function highlightWinningCells() {
    winningCombinations.forEach(combination => {
        if (combination.every(index => board[index] === currentPlayer)) {
            combination.forEach(index => {
                document.querySelector(`.cell[data-index="${index}"]`).classList.add('winner');
            });
        }
    });
}

// Switch player
function switchPlayer() {
    currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
    const playerIndicator = document.getElementById('currentPlayer');
    playerIndicator.textContent = currentPlayer;
    playerIndicator.className = currentPlayer === 'X' ? 'player-x' : 'player-o';
}

// End game
function endGame(message) {
    gameActive = false;
    document.getElementById('resultText').textContent = message;
    document.getElementById('gameResult').classList.add('active');
}

// Reset game
function resetGame() {
    board = ['', '', '', '', '', '', '', '', ''];
    currentPlayer = 'X';
    gameActive = true;

    document.querySelectorAll('.cell').forEach(cell => {
        cell.textContent = '';
        cell.className = 'cell';
    });

    document.getElementById('gameResult').classList.remove('active');
    document.getElementById('currentPlayer').textContent = 'X';
    document.getElementById('currentPlayer').className = 'player-x';
}

// Update scores
function updateScores() {
    localStorage.setItem('tttScoreX', scores.X);
    localStorage.setItem('tttScoreO', scores.O);
    localStorage.setItem('tttScoreDraw', scores.draw);
    updateScoreboard();
}

// Update scoreboard display
function updateScoreboard() {
    document.getElementById('scoreX').textContent = scores.X;
    document.getElementById('scoreO').textContent = scores.O;
    document.getElementById('scoreDraw').textContent = scores.draw;
}

// Reset scores
function resetScores() {
    if (confirm('Are you sure you want to reset all scores?')) {
        scores = { X: 0, O: 0, draw: 0 };
        updateScores();
    }
}
