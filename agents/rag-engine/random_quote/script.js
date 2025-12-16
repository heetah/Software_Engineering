const quotes = [
    { text: '成功不是終點，失敗也不是末日，重要的是繼續前進的勇氣。', author: '溫斯頓·邱吉爾', category: '勵志' },
    { text: '生活就像騎自行車，要保持平衡就必須不斷前進。', author: '愛因斯坦', category: '人生' },
    { text: '唯一限制我們實現明天理想的，是今天的疑慮。', author: '富蘭克林·羅斯福', category: '勵志' },
    { text: '教育的目的不是填滿容器，而是點燃火焰。', author: '葉芝', category: '教育' },
    { text: '你今天的努力，是幸運的伏筆。', author: '未知', category: '勵志' },
    { text: '不要等待機會，而要創造機會。', author: '喬治·伯納德·蕭', category: '成功' },
    { text: '真正的智慧在於知道自己一無所知。', author: '蘇格拉底', category: '智慧' },
    { text: '相信你能做到，你就已經成功了一半。', author: '西奧多·羅斯福', category: '自信' },
    { text: '最好的時機就是現在。', author: '未知', category: '行動' },
    { text: '夢想不會逃走，逃走的永遠是自己。', author: '未知', category: '夢想' },
    { text: '失敗是成功之母。', author: '中國諺語', category: '成長' },
    { text: '活到老，學到老。', author: '中國諺語', category: '學習' },
    { text: '千里之行，始於足下。', author: '老子', category: '行動' },
    { text: '知之為知之，不知為不知，是知也。', author: '孔子', category: '智慧' },
    { text: '己所不欲，勿施於人。', author: '孔子', category: '品德' }
];

let currentQuote = null;
let favorites = JSON.parse(localStorage.getItem('favoriteQuotes')) || [];

const quoteElement = document.getElementById('quote');
const authorElement = document.getElementById('author');
const categoryElement = document.getElementById('category');
const newQuoteBtn = document.getElementById('newQuoteBtn');
const copyBtn = document.getElementById('copyBtn');
const shareBtn = document.getElementById('shareBtn');
const saveBtn = document.getElementById('saveBtn');
const favoritesList = document.getElementById('favoritesList');

function getRandomQuote() {
    const randomIndex = Math.floor(Math.random() * quotes.length);
    currentQuote = quotes[randomIndex];
    displayQuote(currentQuote);
}

function displayQuote(quote) {
    quoteElement.textContent = quote.text;
    authorElement.textContent = quote.author;
    categoryElement.setAttribute('data-category', quote.category);
    categoryElement.textContent = '';

    // 添加淡入動畫
    quoteElement.style.opacity = '0';
    setTimeout(() => {
        quoteElement.style.opacity = '1';
        quoteElement.style.transition = 'opacity 0.5s ease';
    }, 100);
}

function copyQuote() {
    const text = `"${currentQuote.text}" — ${currentQuote.author}`;
    navigator.clipboard.writeText(text).then(() => {
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ 已複製';
        setTimeout(() => {
            copyBtn.textContent = originalText;
        }, 2000);
    });
}

function shareQuote() {
    const text = `"${currentQuote.text}" — ${currentQuote.author}`;
    if (navigator.share) {
        navigator.share({
            title: '每日金句',
            text: text
        });
    } else {
        copyQuote();
        alert('已複製到剪貼簿，可以分享了！');
    }
}

function saveToFavorites() {
    if (!currentQuote) return;

    // 檢查是否已存在
    const exists = favorites.some(fav =>
        fav.text === currentQuote.text && fav.author === currentQuote.author
    );

    if (exists) {
        alert('這句話已經在你的最愛中了！');
        return;
    }

    favorites.unshift(currentQuote);
    localStorage.setItem('favoriteQuotes', JSON.stringify(favorites));
    displayFavorites();

    const originalText = saveBtn.textContent;
    saveBtn.textContent = '✓ 已加入';
    setTimeout(() => {
        saveBtn.textContent = originalText;
    }, 2000);
}

function displayFavorites() {
    favoritesList.innerHTML = '';

    if (favorites.length === 0) {
        favoritesList.innerHTML = '<div class="empty-favorites">還沒有收藏的金句</div>';
        return;
    }

    favorites.forEach((quote, index) => {
        const item = document.createElement('div');
        item.className = 'favorite-item';
        item.innerHTML = `
            <div class="favorite-quote">"${quote.text}"</div>
            <div class="favorite-author">— ${quote.author}</div>
            <button class="delete-favorite" onclick="deleteFavorite(${index})">×</button>
        `;

        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-favorite')) {
                displayQuote(quote);
                currentQuote = quote;
            }
        });

        favoritesList.appendChild(item);
    });
}

function deleteFavorite(index) {
    favorites.splice(index, 1);
    localStorage.setItem('favoriteQuotes', JSON.stringify(favorites));
    displayFavorites();
}

newQuoteBtn.addEventListener('click', getRandomQuote);
copyBtn.addEventListener('click', copyQuote);
shareBtn.addEventListener('click', shareQuote);
saveBtn.addEventListener('click', saveToFavorites);

// 初始化
getRandomQuote();
displayFavorites();
