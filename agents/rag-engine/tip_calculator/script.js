const billInput = document.getElementById('bill');
const tipBtns = document.querySelectorAll('.tip-btn');
const customTipInput = document.getElementById('customTip');
const peopleCountEl = document.getElementById('peopleCount');
const addPeopleBtn = document.getElementById('addPeople');
const minusPeopleBtn = document.getElementById('minusPeople');
const tipPerPersonEl = document.getElementById('tipPerPerson');
const totalPerPersonEl = document.getElementById('totalPerPerson');
const resetBtn = document.getElementById('resetBtn');

let billValue = 0;
let tipPercentage = 0.10; // Default 10%
let peopleValue = 1;

function calculate() {
    if (billValue >= 0 && peopleValue >= 1) {
        const tipAmount = billValue * tipPercentage;
        const totalAmount = billValue + tipAmount;

        const tipPerPerson = tipAmount / peopleValue;
        const totalPerPerson = totalAmount / peopleValue;

        tipPerPersonEl.textContent = '$' + tipPerPerson.toFixed(2);
        totalPerPersonEl.textContent = '$' + totalPerPerson.toFixed(2);
    }
}

function reset() {
    billInput.value = '';
    billValue = 0;
    peopleValue = 1;
    peopleCountEl.textContent = '1';
    setActiveTip(0.10);
    // Reset buttons visual state
    tipBtns.forEach(btn => btn.classList.remove('active'));
    tipBtns[1].classList.add('active'); // Set 10% active again
    customTipInput.value = '';

    tipPerPersonEl.textContent = '$0.00';
    totalPerPersonEl.textContent = '$0.00';
}

function setActiveTip(val) {
    tipPercentage = val;
    calculate();
}

// Event Listeners
billInput.addEventListener('input', (e) => {
    billValue = parseFloat(e.target.value);
    if (isNaN(billValue)) billValue = 0;
    calculate();
});

tipBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        tipBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        customTipInput.value = '';
        setActiveTip(parseFloat(e.target.dataset.value));
    });
});

customTipInput.addEventListener('input', (e) => {
    tipBtns.forEach(b => b.classList.remove('active'));
    let val = parseFloat(e.target.value);
    if (!isNaN(val) && val >= 0) {
        setActiveTip(val / 100);
    } else {
        setActiveTip(0);
    }
});

addPeopleBtn.addEventListener('click', () => {
    peopleValue++;
    peopleCountEl.textContent = peopleValue;
    calculate();
});

minusPeopleBtn.addEventListener('click', () => {
    if (peopleValue > 1) {
        peopleValue--;
        peopleCountEl.textContent = peopleValue;
        calculate();
    }
});

resetBtn.addEventListener('click', reset);
