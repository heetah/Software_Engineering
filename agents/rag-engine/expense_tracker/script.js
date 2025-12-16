let transactions = JSON.parse(localStorage.getItem('transactions')) || [];

const descriptionInput = document.getElementById('description');
const amountInput = document.getElementById('amount');
const typeSelect = document.getElementById('type');
const categorySelect = document.getElementById('category');
const addBtn = document.getElementById('addBtn');
const clearBtn = document.getElementById('clearBtn');
const transactionList = document.getElementById('transactionList');
const balanceElement = document.getElementById('balance');
const incomeElement = document.getElementById('income');
const expenseElement = document.getElementById('expense');

const categoryNames = {
    salary: '薪資',
    food: '飲食',
    transport: '交通',
    shopping: '購物',
    entertainment: '娛樂',
    bills: '帳單',
    other: '其他'
};

function addTransaction() {
    const description = descriptionInput.value.trim();
    const amount = parseFloat(amountInput.value);
    const type = typeSelect.value;
    const category = categorySelect.value;

    if (!description || !amount || amount <= 0) {
        alert('請填寫有效的描述和金額');
        return;
    }

    const transaction = {
        id: Date.now(),
        description,
        amount,
        type,
        category,
        date: new Date().toLocaleDateString('zh-TW')
    };

    transactions.unshift(transaction);
    saveTransactions();
    displayTransactions();
    updateBalance();

    // 清空表單
    descriptionInput.value = '';
    amountInput.value = '';
}

function deleteTransaction(id) {
    transactions = transactions.filter(t => t.id !== id);
    saveTransactions();
    displayTransactions();
    updateBalance();
}

function clearAllTransactions() {
    if (confirm('確定要清除所有交易紀錄嗎？')) {
        transactions = [];
        saveTransactions();
        displayTransactions();
        updateBalance();
    }
}

function displayTransactions() {
    transactionList.innerHTML = '';

    if (transactions.length === 0) {
        transactionList.innerHTML = '<p style="text-align: center; color: #999; padding: 20px;">尚無交易紀錄</p>';
        return;
    }

    transactions.forEach(transaction => {
        const item = document.createElement('div');
        item.className = `transaction-item ${transaction.type}`;

        const sign = transaction.type === 'income' ? '+' : '-';

        item.innerHTML = `
            <div class="transaction-info">
                <div class="transaction-description">${transaction.description}</div>
                <span class="transaction-category">${categoryNames[transaction.category]}</span>
            </div>
            <div class="transaction-amount">${sign}$${transaction.amount.toFixed(2)}</div>
            <button class="transaction-delete" onclick="deleteTransaction(${transaction.id})">刪除</button>
        `;

        transactionList.appendChild(item);
    });
}

function updateBalance() {
    const income = transactions
        .filter(t => t.type === 'income')
        .reduce((sum, t) => sum + t.amount, 0);

    const expense = transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);

    const balance = income - expense;

    balanceElement.textContent = `$${balance.toFixed(2)}`;
    incomeElement.textContent = `$${income.toFixed(2)}`;
    expenseElement.textContent = `$${expense.toFixed(2)}`;
}

function saveTransactions() {
    localStorage.setItem('transactions', JSON.stringify(transactions));
}

addBtn.addEventListener('click', addTransaction);
clearBtn.addEventListener('click', clearAllTransactions);

// 按下 Enter 也可以新增
amountInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTransaction();
});

descriptionInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addTransaction();
});

// 初始化
displayTransactions();
updateBalance();
