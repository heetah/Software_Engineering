// 模擬匯率資料（實際應用應從 API 獲取）
const exchangeRates = {
    TWD: 1,
    USD: 0.032,
    EUR: 0.029,
    JPY: 4.85,
    GBP: 0.025,
    CNY: 0.23,
    KRW: 43.5,
    HKD: 0.25
};

const fromAmountInput = document.getElementById('fromAmount');
const toAmountInput = document.getElementById('toAmount');
const fromCurrencySelect = document.getElementById('fromCurrency');
const toCurrencySelect = document.getElementById('toCurrency');
const swapBtn = document.getElementById('swapBtn');
const exchangeRateDisplay = document.getElementById('exchangeRate');
const rateGrid = document.getElementById('rateGrid');
const lastUpdated = document.getElementById('lastUpdated');

function convertCurrency() {
    const amount = parseFloat(fromAmountInput.value) || 0;
    const fromCurrency = fromCurrencySelect.value;
    const toCurrency = toCurrencySelect.value;

    // 先轉換成 TWD，再轉換成目標貨幣
    const amountInTWD = amount / exchangeRates[fromCurrency];
    const convertedAmount = amountInTWD * exchangeRates[toCurrency];

    toAmountInput.value = convertedAmount.toFixed(2);

    // 顯示匯率
    const rate = exchangeRates[toCurrency] / exchangeRates[fromCurrency];
    exchangeRateDisplay.textContent = `1 ${fromCurrency} = ${rate.toFixed(4)} ${toCurrency}`;
}

function swapCurrencies() {
    const tempCurrency = fromCurrencySelect.value;
    fromCurrencySelect.value = toCurrencySelect.value;
    toCurrencySelect.value = tempCurrency;

    const tempAmount = fromAmountInput.value;
    fromAmountInput.value = toAmountInput.value;

    convertCurrency();
}

function displayPopularRates() {
    const popularPairs = [
        { from: 'TWD', to: 'USD' },
        { from: 'TWD', to: 'JPY' },
        { from: 'USD', to: 'TWD' },
        { from: 'CNY', to: 'TWD' }
    ];

    rateGrid.innerHTML = '';

    popularPairs.forEach(pair => {
        const rate = exchangeRates[pair.to] / exchangeRates[pair.from];

        const card = document.createElement('div');
        card.className = 'rate-card';
        card.innerHTML = `
            <div class="currency-pair">${pair.from} → ${pair.to}</div>
            <div class="rate-value">${rate.toFixed(4)}</div>
        `;

        card.addEventListener('click', () => {
            fromCurrencySelect.value = pair.from;
            toCurrencySelect.value = pair.to;
            convertCurrency();
        });

        rateGrid.appendChild(card);
    });
}

function updateLastUpdatedTime() {
    const now = new Date();
    const timeString = now.toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
    lastUpdated.textContent = `匯率資料更新時間：${timeString}`;
}

// 事件監聽
fromAmountInput.addEventListener('input', convertCurrency);
fromCurrencySelect.addEventListener('change', convertCurrency);
toCurrencySelect.addEventListener('change', convertCurrency);
swapBtn.addEventListener('click', swapCurrencies);

// 初始化
convertCurrency();
displayPopularRates();
updateLastUpdatedTime();

// 注意：這是一個簡化版本，使用固定的匯率
// 實際應用應該使用真實的匯率 API，例如：
// - exchangerate-api.com
// - fixer.io
// - openexchangerates.org
/*
async function fetchExchangeRates() {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/TWD');
        const data = await response.json();
        exchangeRates = data.rates;
        convertCurrency();
    } catch (error) {
        console.error('無法獲取匯率資料', error);
    }
}
*/
