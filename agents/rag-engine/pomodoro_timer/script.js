// Config
const WORK_TIME = 25 * 60;
const BREAK_TIME = 5 * 60;

// State
let timeLeft = WORK_TIME;
let timerId = null;
let isWorkMode = true;

// DOM Elements
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const startBtn = document.getElementById('start-btn');
const pauseBtn = document.getElementById('pause-btn');
const resetBtn = document.getElementById('reset-btn');
const workBtn = document.getElementById('work-mode');
const breakBtn = document.getElementById('break-mode');
const statusMsg = document.getElementById('status-message');
const body = document.body;

// Functions
function updateDisplay() {
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    minutesEl.textContent = minutes.toString().padStart(2, '0');
    secondsEl.textContent = seconds.toString().padStart(2, '0');

    // Update tab title
    document.title = `${minutes}:${seconds.toString().padStart(2, '0')} - Pomodoro`;
}

function startTimer() {
    if (timerId) return;

    startBtn.disabled = true;
    pauseBtn.disabled = false;
    statusMsg.textContent = isWorkMode ? "Focus mode ON" : "Relax mode ON";

    timerId = setInterval(() => {
        timeLeft--;
        updateDisplay();

        if (timeLeft === 0) {
            clearInterval(timerId);
            timerId = null;
            startBtn.disabled = false;
            pauseBtn.disabled = true;
            statusMsg.textContent = "Time's up!";
            alert("Timer finished!");
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerId);
    timerId = null;
    startBtn.disabled = false;
    pauseBtn.disabled = true;
    statusMsg.textContent = "Timer paused";
}

function resetTimer() {
    pauseTimer();
    timeLeft = isWorkMode ? WORK_TIME : BREAK_TIME;
    updateDisplay();
    statusMsg.textContent = isWorkMode ? "Ready to focus?" : "Ready to relax?";
}

function switchMode(mode) {
    if (mode === 'work') {
        isWorkMode = true;
        timeLeft = WORK_TIME;
        workBtn.classList.add('active');
        breakBtn.classList.remove('active');
        body.classList.remove('break-mode');
        statusMsg.textContent = "Time to focus!";
    } else {
        isWorkMode = false;
        timeLeft = BREAK_TIME;
        breakBtn.classList.add('active');
        workBtn.classList.remove('active');
        body.classList.add('break-mode');
        statusMsg.textContent = "Time for a break!";
    }
    pauseTimer();
    updateDisplay();
}

// Event Listeners
startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resetBtn.addEventListener('click', resetTimer);

workBtn.addEventListener('click', () => switchMode('work'));
breakBtn.addEventListener('click', () => switchMode('break'));

// Init
updateDisplay();
