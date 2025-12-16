const weightInput = document.getElementById('weight');
const heightInput = document.getElementById('height');
const calculateBtn = document.getElementById('calculateBtn');
const result = document.getElementById('result');
const bmiValue = document.getElementById('bmiValue');
const bmiCategory = document.getElementById('bmiCategory');
const bmiDescription = document.getElementById('bmiDescription');

function calculateBMI() {
    const weight = parseFloat(weightInput.value);
    const height = parseFloat(heightInput.value);

    if (!weight || weight <= 0) {
        alert('請輸入有效的體重');
        return;
    }

    if (!height || height <= 0) {
        alert('請輸入有效的身高');
        return;
    }

    // 將身高從公分轉換為公尺
    const heightInMeters = height / 100;
    const bmi = weight / (heightInMeters * heightInMeters);

    displayResult(bmi);
}

function displayResult(bmi) {
    const bmiRounded = bmi.toFixed(1);
    bmiValue.textContent = bmiRounded;

    let category, description, color;

    if (bmi < 18.5) {
        category = '體重過輕';
        description = '您的體重過輕，建議增加營養攝取並進行適當運動以增加肌肉量。';
        color = '#17a2b8';
    } else if (bmi >= 18.5 && bmi < 24) {
        category = '正常範圍';
        description = '恭喜！您的體重在正常範圍內，請保持健康的生活習慣。';
        color = '#28a745';
    } else if (bmi >= 24 && bmi < 27) {
        category = '體重過重';
        description = '您的體重稍微過重，建議控制飲食並增加運動量。';
        color = '#ffc107';
    } else {
        category = '肥胖';
        description = '您的 BMI 值偏高，建議諮詢醫師或營養師，制定健康的減重計畫。';
        color = '#dc3545';
    }

    bmiCategory.textContent = category;
    bmiCategory.style.color = color;
    bmiDescription.textContent = description;

    result.classList.remove('hidden');
}

calculateBtn.addEventListener('click', calculateBMI);

// 按下 Enter 鍵也可以計算
weightInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') calculateBMI();
});

heightInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') calculateBMI();
});
