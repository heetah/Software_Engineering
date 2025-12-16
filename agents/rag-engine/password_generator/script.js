const passwordInput = document.getElementById('password');
const lengthSlider = document.getElementById('lengthSlider');
const lengthValue = document.getElementById('lengthValue');
const uppercaseCheck = document.getElementById('uppercase');
const lowercaseCheck = document.getElementById('lowercase');
const numbersCheck = document.getElementById('numbers');
const symbolsCheck = document.getElementById('symbols');
const generateBtn = document.getElementById('generateBtn');
const copyBtn = document.getElementById('copyBtn');
const strengthBar = document.getElementById('strengthBar');
const strengthText = document.getElementById('strengthText');
const historyList = document.getElementById('historyList');

const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz';
const numberChars = '0123456789';
const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

let passwordHistory = JSON.parse(localStorage.getItem('passwordHistory')) || [];

function generatePassword() {
    const length = parseInt(lengthSlider.value);
    let charset = '';
    let password = '';

    if (uppercaseCheck.checked) charset += uppercaseChars;
    if (lowercaseCheck.checked) charset += lowercaseChars;
    if (numbersCheck.checked) charset += numberChars;
    if (symbolsCheck.checked) charset += symbolChars;

    if (charset === '') {
        alert('請至少選擇一種字元類型');
        return;
    }

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }

    passwordInput.value = password;
    updateStrengthMeter(password);
    addToHistory(password);
}

function updateStrengthMeter(password) {
    let strength = 0;

    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;

    strengthBar.className = 'strength-bar';

    if (strength <= 2) {
        strengthBar.classList.add('weak');
        strengthText.textContent = '密碼強度：弱';
        strengthText.style.color = '#dc3545';
    } else if (strength <= 4) {
        strengthBar.classList.add('medium');
        strengthText.textContent = '密碼強度：中等';
        strengthText.style.color = '#ffc107';
    } else {
        strengthBar.classList.add('strong');
        strengthText.textContent = '密碼強度：強';
        strengthText.style.color = '#28a745';
    }
}

function copyPassword() {
    if (passwordInput.value === '') {
        alert('請先產生密碼');
        return;
    }

    passwordInput.select();
    document.execCommand('copy');

    const originalText = copyBtn.textContent;
    copyBtn.textContent = '✓';
    setTimeout(() => {
        copyBtn.textContent = originalText;
    }, 1500);
}

function addToHistory(password) {
    if (passwordHistory.length >= 10) {
        passwordHistory.pop();
    }
    passwordHistory.unshift(password);
    localStorage.setItem('passwordHistory', JSON.stringify(passwordHistory));
    displayHistory();
}

function displayHistory() {
    historyList.innerHTML = '';
    passwordHistory.forEach((password, index) => {
        const item = document.createElement('div');
        item.className = 'history-item';

        const passwordSpan = document.createElement('span');
        passwordSpan.textContent = password;

        const copyHistoryBtn = document.createElement('button');
        copyHistoryBtn.textContent = '複製';
        copyHistoryBtn.onclick = () => {
            navigator.clipboard.writeText(password);
            copyHistoryBtn.textContent = '已複製';
            setTimeout(() => {
                copyHistoryBtn.textContent = '複製';
            }, 1500);
        };

        item.appendChild(passwordSpan);
        item.appendChild(copyHistoryBtn);
        historyList.appendChild(item);
    });
}

lengthSlider.addEventListener('input', (e) => {
    lengthValue.textContent = e.target.value;
});

generateBtn.addEventListener('click', generatePassword);
copyBtn.addEventListener('click', copyPassword);

// 初始化
displayHistory();
generatePassword();
