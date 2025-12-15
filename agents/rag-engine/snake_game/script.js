// Game variables
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const gridSize = 20;
const tileCount = canvas.width / gridSize;

let snake = [{ x: 10, y: 10 }];
let food = { x: 15, y: 15 };
let dx = 0;
let dy = 0;
let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
let gameLoop = null;
let gameSpeed = 100;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('highScore').textContent = highScore;
    setupKeyboardControls();
});

// Start game
function startGame() {
    document.getElementById('startScreen').classList.remove('active');
    resetGame();
    gameLoop = setInterval(update, gameSpeed);
}

// Reset game
function resetGame() {
    snake = [{ x: 10, y: 10 }];
    food = generateFood();
    dx = 1;
    dy = 0;
    score = 0;
    updateScore();
}

// Restart game
function restartGame() {
    document.getElementById('gameOver').classList.remove('active');
    startGame();
}

// Game update loop
function update() {
    moveSnake();

    if (checkCollision()) {
        gameOver();
        return;
    }

    if (checkFoodCollision()) {
        score += 10;
        updateScore();
        growSnake();
        food = generateFood();
    }

    draw();
}

// Move snake
function moveSnake() {
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    snake.unshift(head);
    snake.pop();
}

// Grow snake
function growSnake() {
    const tail = { ...snake[snake.length - 1] };
    snake.push(tail);
}

// Check collision with walls or self
function checkCollision() {
    const head = snake[0];

    // Wall collision
    if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount) {
        return true;
    }

    // Self collision
    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            return true;
        }
    }

    return false;
}

// Check food collision
function checkFoodCollision() {
    return snake[0].x === food.x && snake[0].y === food.y;
}

// Generate food
function generateFood() {
    let newFood;
    let isOnSnake;

    do {
        newFood = {
            x: Math.floor(Math.random() * tileCount),
            y: Math.floor(Math.random() * tileCount)
        };

        isOnSnake = snake.some(segment => segment.x === newFood.x && segment.y === newFood.y);
    } while (isOnSnake);

    return newFood;
}

// Draw game
function draw() {
    // Clear canvas
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw snake
    snake.forEach((segment, index) => {
        const gradient = ctx.createLinearGradient(
            segment.x * gridSize, segment.y * gridSize,
            (segment.x + 1) * gridSize, (segment.y + 1) * gridSize
        );
        gradient.addColorStop(0, '#00b4db');
        gradient.addColorStop(1, '#0083b0');

        ctx.fillStyle = gradient;
        ctx.fillRect(
            segment.x * gridSize + 1,
            segment.y * gridSize + 1,
            gridSize - 2,
            gridSize - 2
        );
    });

    // Draw food
    ctx.fillStyle = '#ff4757';
    ctx.beginPath();
    ctx.arc(
        food.x * gridSize + gridSize / 2,
        food.y * gridSize + gridSize / 2,
        gridSize / 2 - 2,
        0,
        Math.PI * 2
    );
    ctx.fill();
}

// Update score
function updateScore() {
    document.getElementById('score').textContent = score;

    if (score > highScore) {
        highScore = score;
        document.getElementById('highScore').textContent = highScore;
        localStorage.setItem('snakeHighScore', highScore);
    }
}

// Game over
function gameOver() {
    clearInterval(gameLoop);
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').classList.add('active');
}

// Keyboard controls
function setupKeyboardControls() {
    document.addEventListener('keydown', (e) => {
        if (document.getElementById('gameOver').classList.contains('active') ||
            document.getElementById('startScreen').classList.contains('active')) {
            return;
        }

        switch (e.key) {
            case 'ArrowUp':
            case 'w':
            case 'W':
                if (dy === 0) { dx = 0; dy = -1; }
                break;
            case 'ArrowDown':
            case 's':
            case 'S':
                if (dy === 0) { dx = 0; dy = 1; }
                break;
            case 'ArrowLeft':
            case 'a':
            case 'A':
                if (dx === 0) { dx = -1; dy = 0; }
                break;
            case 'ArrowRight':
            case 'd':
            case 'D':
                if (dx === 0) { dx = 1; dy = 0; }
                break;
        }
    });
}
