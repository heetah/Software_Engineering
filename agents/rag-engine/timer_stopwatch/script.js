// Timer variables
let timerInterval = null;
let timerSeconds = 0;
let timerRunning = false;

// Stopwatch variables
let stopwatchInterval = null;
let stopwatchMilliseconds = 0;
let stopwatchRunning = false;
let lapCounter = 0;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    setupInputValidation();
});

// Tab switching
function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;

            // Update active tab button
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update active tab content
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(targetTab).classList.add('active');
        });
    });
}

// Input validation for timer
function setupInputValidation() {
    const inputs = ['hours', 'minutes', 'seconds'];

    inputs.forEach(id => {
        const input = document.getElementById(id);
        input.addEventListener('input', () => {
            const max = id === 'hours' ? 23 : 59;
            if (parseInt(input.value) > max) {
                input.value = max;
            }
            if (input.value.length > 2) {
                input.value = input.value.slice(0, 2);
            }
        });
    });
}

// ========== TIMER FUNCTIONS ==========

function startTimer() {
    if (timerRunning) return;

    // Get time from inputs
    const hours = parseInt(document.getElementById('hours').value) || 0;
    const minutes = parseInt(document.getElementById('minutes').value) || 0;
    const seconds = parseInt(document.getElementById('seconds').value) || 0;

    if (timerSeconds === 0) {
        timerSeconds = hours * 3600 + minutes * 60 + seconds;
    }

    if (timerSeconds === 0) return;

    timerRunning = true;
    toggleTimerButtons(true);

    timerInterval = setInterval(() => {
        timerSeconds--;
        updateTimerDisplay();

        if (timerSeconds <= 0) {
            pauseTimer();
            playTimerSound();
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    toggleTimerButtons(false);
}

function resetTimer() {
    clearInterval(timerInterval);
    timerSeconds = 0;
    timerRunning = false;
    toggleTimerButtons(false);

    document.getElementById('hours').value = 0;
    document.getElementById('minutes').value = 5;
    document.getElementById('seconds').value = 0;
}

function updateTimerDisplay() {
    const hours = Math.floor(timerSeconds / 3600);
    const minutes = Math.floor((timerSeconds % 3600) / 60);
    const seconds = timerSeconds % 60;

    document.getElementById('hours').value = hours.toString().padStart(2, '0');
    document.getElementById('minutes').value = minutes.toString().padStart(2, '0');
    document.getElementById('seconds').value = seconds.toString().padStart(2, '0');
}

function toggleTimerButtons(running) {
    document.getElementById('timerStart').style.display = running ? 'none' : 'block';
    document.getElementById('timerPause').style.display = running ? 'block' : 'none';
}

function playTimerSound() {
    // Play notification sound (browser alert)
    alert('Timer finished!');
}

// ========== STOPWATCH FUNCTIONS ==========

function startStopwatch() {
    if (stopwatchRunning) return;

    stopwatchRunning = true;
    toggleStopwatchButtons(true);

    const startTime = Date.now() - stopwatchMilliseconds;

    stopwatchInterval = setInterval(() => {
        stopwatchMilliseconds = Date.now() - startTime;
        updateStopwatchDisplay();
    }, 10);
}

function pauseStopwatch() {
    clearInterval(stopwatchInterval);
    stopwatchRunning = false;
    toggleStopwatchButtons(false);
    recordLap();
}

function resetStopwatch() {
    clearInterval(stopwatchInterval);
    stopwatchMilliseconds = 0;
    stopwatchRunning = false;
    lapCounter = 0;
    toggleStopwatchButtons(false);
    updateStopwatchDisplay();
    clearLaps();
}

function updateStopwatchDisplay() {
    const totalSeconds = Math.floor(stopwatchMilliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const centiseconds = Math.floor((stopwatchMilliseconds % 1000) / 10);

    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`;

    document.getElementById('stopwatchDisplay').textContent = timeString;
}

function toggleStopwatchButtons(running) {
    document.getElementById('stopwatchStart').style.display = running ? 'none' : 'block';
    document.getElementById('stopwatchPause').style.display = running ? 'block' : 'none';
}

function recordLap() {
    if (stopwatchMilliseconds === 0) return;

    lapCounter++;
    const lapTime = document.getElementById('stopwatchDisplay').textContent;
    const lapsList = document.getElementById('lapsList');
    const lapsContainer = document.getElementById('lapsContainer');

    const lapItem = document.createElement('li');
    lapItem.className = 'lap-item';
    lapItem.innerHTML = `
        <span class="lap-number">Lap ${lapCounter}</span>
        <span class="lap-time">${lapTime}</span>
    `;

    lapsList.insertBefore(lapItem, lapsList.firstChild);
    lapsContainer.style.display = 'block';
}

function clearLaps() {
    document.getElementById('lapsList').innerHTML = '';
    document.getElementById('lapsContainer').style.display = 'none';
}
