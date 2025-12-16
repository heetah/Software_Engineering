let countdown;
let totalSeconds = 0;
let isPaused = false;

const hoursInput = document.getElementById('hours');
const minutesInput = document.getElementById('minutes');
const secondsInput = document.getElementById('seconds');
const timeInputs = document.getElementById('timeInputs');
const display = document.getElementById('display');
const displayHours = document.getElementById('displayHours');
const displayMinutes = document.getElementById('displayMinutes');
const displaySeconds = document.getElementById('displaySeconds');
const startBtn = document.getElementById('startBtn');
const pauseBtn = document.getElementById('pauseBtn');
const resumeBtn = document.getElementById('resumeBtn');
const resetBtn = document.getElementById('resetBtn');
const presetButtons = document.querySelectorAll('.preset-btn');

function updateDisplay() {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    displayHours.textContent = String(hours).padStart(2, '0');
    displayMinutes.textContent = String(minutes).padStart(2, '0');
    displaySeconds.textContent = String(seconds).padStart(2, '0');

    // 添加警告效果
    display.classList.remove('warning', 'danger');
    if (totalSeconds <= 10 && totalSeconds > 0) {
        display.classList.add('danger');
    } else if (totalSeconds <= 60 && totalSeconds > 10) {
        display.classList.add('warning');
    }
}

function startTimer() {
    const hours = parseInt(hoursInput.value) || 0;
    const minutes = parseInt(minutesInput.value) || 0;
    const seconds = parseInt(secondsInput.value) || 0;

    totalSeconds = hours * 3600 + minutes * 60 + seconds;

    if (totalSeconds <= 0) {
        alert('請設定倒數時間');
        return;
    }

    timeInputs.classList.add('hidden');
    display.classList.remove('hidden');
    startBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');

    updateDisplay();
    runTimer();
}

function runTimer() {
    countdown = setInterval(() => {
        if (totalSeconds > 0) {
            totalSeconds--;
            updateDisplay();
        } else {
            clearInterval(countdown);
            timerComplete();
        }
    }, 1000);
}

function pauseTimer() {
    clearInterval(countdown);
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.remove('hidden');
}

function resumeTimer() {
    resumeBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    runTimer();
}

function resetTimer() {
    clearInterval(countdown);
    totalSeconds = 0;

    timeInputs.classList.remove('hidden');
    display.classList.remove('hidden');
    display.classList.add('hidden');
    startBtn.classList.remove('hidden');
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.add('hidden');
}

function timerComplete() {
    alert('⏰ 時間到！');
    playSound();
    resetTimer();
}

function playSound() {
    // 使用 Web Audio API 播放提示音
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

function setPresetTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    hoursInput.value = hours;
    minutesInput.value = remainingMinutes;
    secondsInput.value = 0;
}

startBtn.addEventListener('click', startTimer);
pauseBtn.addEventListener('click', pauseTimer);
resumeBtn.addEventListener('click', resumeTimer);
resetBtn.addEventListener('click', resetTimer);

presetButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const minutes = parseInt(btn.getAttribute('data-minutes'));
        setPresetTime(minutes);
    });
});
