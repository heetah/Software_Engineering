const sampleTexts = [
    '快速的棕色狐狸跳過懶狗。這是一個測試打字速度和準確性的經典句子。',
    '科技改變了我們的生活方式，讓世界變得更加便利和互聯。',
    '學習新技能需要時間和耐心，但堅持就會看到進步。',
    '每天進步一點點，長期累積就會產生巨大的變化。',
    '閱讀是獲取知識的最好方式之一，它能開闊視野擴展思維。'
];

let currentText = '';
let currentIndex = 0;
let correctChars = 0;
let totalChars = 0;
let startTime = null;
let timerInterval = null;
let testDuration = 60;

const durationSelect = document.getElementById('duration');
const timeLeftDisplay = document.getElementById('timeLeft');
const wpmDisplay = document.getElementById('wpm');
const accuracyDisplay = document.getElementById('accuracy');
const textDisplay = document.getElementById('textDisplay');
const inputArea = document.getElementById('inputArea');
const startBtn = document.getElementById('startBtn');
const result = document.getElementById('result');
const finalWPM = document.getElementById('finalWPM');
const finalAccuracy = document.getElementById('finalAccuracy');
const totalCharsDisplay = document.getElementById('totalChars');
const retryBtn = document.getElementById('retryBtn');

function startTest() {
    testDuration = parseInt(durationSelect.value);
    currentText = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    currentIndex = 0;
    correctChars = 0;
    totalChars = 0;
    startTime = Date.now();

    displayText();
    inputArea.value = '';
    inputArea.disabled = false;
    inputArea.focus();

    startBtn.classList.add('hidden');
    result.classList.add('hidden');
    durationSelect.disabled = true;

    startTimer();
}

function displayText() {
    textDisplay.innerHTML = '';
    currentText.split('').forEach((char, index) => {
        const span = document.createElement('span');
        span.textContent = char;
        span.className = 'char';
        if (index === currentIndex) {
            span.classList.add('current');
        }
        textDisplay.appendChild(span);
    });
}

function startTimer() {
    let timeLeft = testDuration;
    timeLeftDisplay.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timeLeftDisplay.textContent = timeLeft;

        if (timeLeft <= 0) {
            endTest();
        }
    }, 1000);
}

function updateDisplay() {
    const chars = textDisplay.querySelectorAll('.char');
    const inputValue = inputArea.value;

    chars.forEach((char, index) => {
        char.classList.remove('correct', 'incorrect', 'current');

        if (index < inputValue.length) {
            if (inputValue[index] === currentText[index]) {
                char.classList.add('correct');
            } else {
                char.classList.add('incorrect');
            }
        } else if (index === inputValue.length) {
            char.classList.add('current');
        }
    });

    currentIndex = inputValue.length;

    // 計算統計數據
    correctChars = 0;
    for (let i = 0; i < inputValue.length; i++) {
        if (inputValue[i] === currentText[i]) {
            correctChars++;
        }
    }
    totalChars = inputValue.length;

    // 更新 WPM
    const timeElapsed = (Date.now() - startTime) / 1000 / 60; // 分鐘
    const wordsTyped = correctChars / 5; // 假設平均每個單詞 5 個字符
    const wpm = Math.round(wordsTyped / timeElapsed) || 0;
    wpmDisplay.textContent = wpm;

    // 更新準確率
    const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;
    accuracyDisplay.textContent = accuracy + '%';
}

function endTest() {
    clearInterval(timerInterval);
    inputArea.disabled = true;
    durationSelect.disabled = false;

    // 計算最終統計
    const timeElapsed = testDuration / 60;
    const wordsTyped = correctChars / 5;
    const wpm = Math.round(wordsTyped / timeElapsed);
    const accuracy = totalChars > 0 ? Math.round((correctChars / totalChars) * 100) : 100;

    finalWPM.textContent = wpm + ' WPM';
    finalAccuracy.textContent = accuracy + '%';
    totalCharsDisplay.textContent = totalChars;

    result.classList.remove('hidden');
    startBtn.classList.remove('hidden');
}

function resetTest() {
    clearInterval(timerInterval);
    inputArea.value = '';
    inputArea.disabled = true;
    textDisplay.innerHTML = '點擊開始按鈕開始測試';
    timeLeftDisplay.textContent = durationSelect.value;
    wpmDisplay.textContent = '0';
    accuracyDisplay.textContent = '100%';
    result.classList.add('hidden');
    startBtn.classList.remove('hidden');
    durationSelect.disabled = false;
}

inputArea.addEventListener('input', updateDisplay);
startBtn.addEventListener('click', startTest);
retryBtn.addEventListener('click', resetTest);

// 初始化
textDisplay.textContent = '點擊開始按鈕開始測試';
