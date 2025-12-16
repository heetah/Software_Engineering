const quizData = {
    general: [
        { question: "台灣最高的山是哪一座？", options: ["玉山", "雪山", "合歡山", "阿里山"], answer: 0 },
        { question: "地球上最大的海洋是？", options: ["大西洋", "印度洋", "太平洋", "北冰洋"], answer: 2 },
        { question: "一年有多少天？", options: ["364天", "365天", "366天", "360天"], answer: 1 },
        { question: "台北101有幾層樓？", options: ["88層", "101層", "108層", "95層"], answer: 1 },
        { question: "台灣的國花是？", options: ["蘭花", "梅花", "櫻花", "玫瑰"], answer: 1 }
    ],
    science: [
        { question: "水的化學式是？", options: ["H2O", "CO2", "O2", "H2O2"], answer: 0 },
        { question: "光速大約是多少？", options: ["30萬公里/秒", "3萬公里/秒", "300公里/秒", "3000公里/秒"], answer: 0 },
        { question: "人體最大的器官是？", options: ["心臟", "肝臟", "皮膚", "肺"], answer: 2 },
        { question: "DNA的全名是？", options: ["去氧核糖核酸", "核糖核酸", "蛋白質", "脂肪"], answer: 0 },
        { question: "太陽系中最大的行星是？", options: ["土星", "天王星", "木星", "海王星"], answer: 2 }
    ],
    history: [
        { question: "第一次世界大戰發生在哪一年？", options: ["1914年", "1918年", "1939年", "1945年"], answer: 0 },
        { question: "台灣光復是在哪一年？", options: ["1945年", "1949年", "1950年", "1911年"], answer: 0 },
        { question: "誰發明了電燈泡？", options: ["牛頓", "愛因斯坦", "愛迪生", "特斯拉"], answer: 2 },
        { question: "中華民國在哪一年建立？", options: ["1911年", "1912年", "1949年", "1945年"], answer: 1 },
        { question: "萬里長城是哪個朝代建造的？", options: ["秦朝", "漢朝", "唐朝", "明朝"], answer: 0 }
    ]
};

let currentCategory = 'general';
let currentQuestionIndex = 0;
let score = 0;
let selectedAnswer = null;

const startScreen = document.getElementById('startScreen');
const quizScreen = document.getElementById('quizScreen');
const resultScreen = document.getElementById('resultScreen');
const categorySelect = document.getElementById('categorySelect');
const startBtn = document.getElementById('startBtn');
const questionElement = document.getElementById('question');
const optionsElement = document.getElementById('options');
const nextBtn = document.getElementById('nextBtn');
const currentQuestionElement = document.getElementById('currentQuestion');
const totalQuestionsElement = document.getElementById('totalQuestions');
const scoreElement = document.getElementById('score');
const progressElement = document.getElementById('progress');
const finalScoreElement = document.getElementById('finalScore');
const resultMessageElement = document.getElementById('resultMessage');
const restartBtn = document.getElementById('restartBtn');

function startQuiz() {
    currentCategory = categorySelect.value;
    currentQuestionIndex = 0;
    score = 0;
    selectedAnswer = null;

    totalQuestionsElement.textContent = quizData[currentCategory].length;

    startScreen.classList.add('hidden');
    quizScreen.classList.remove('hidden');

    showQuestion();
}

function showQuestion() {
    const question = quizData[currentCategory][currentQuestionIndex];
    selectedAnswer = null;
    nextBtn.classList.add('hidden');

    questionElement.textContent = question.question;
    currentQuestionElement.textContent = currentQuestionIndex + 1;

    // 更新進度條
    const progress = ((currentQuestionIndex + 1) / quizData[currentCategory].length) * 100;
    progressElement.style.width = progress + '%';

    // 顯示選項
    optionsElement.innerHTML = '';
    question.options.forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'option';
        optionElement.textContent = option;
        optionElement.addEventListener('click', () => selectAnswer(index));
        optionsElement.appendChild(optionElement);
    });
}

function selectAnswer(index) {
    if (selectedAnswer !== null) return;

    selectedAnswer = index;
    const question = quizData[currentCategory][currentQuestionIndex];
    const options = optionsElement.querySelectorAll('.option');

    options.forEach((option, i) => {
        option.classList.add('disabled');
        if (i === question.answer) {
            option.classList.add('correct');
        }
        if (i === selectedAnswer && selectedAnswer !== question.answer) {
            option.classList.add('wrong');
        }
    });

    if (selectedAnswer === question.answer) {
        score += 10;
        scoreElement.textContent = score;
    }

    nextBtn.classList.remove('hidden');
}

function nextQuestion() {
    currentQuestionIndex++;

    if (currentQuestionIndex < quizData[currentCategory].length) {
        showQuestion();
    } else {
        showResult();
    }
}

function showResult() {
    quizScreen.classList.add('hidden');
    resultScreen.classList.remove('hidden');

    const totalQuestions = quizData[currentCategory].length;
    const percentage = (score / (totalQuestions * 10)) * 100;

    finalScoreElement.textContent = score;

    let message = '';
    if (percentage === 100) {
        message = '完美！你真是知識王！🎉';
    } else if (percentage >= 80) {
        message = '太棒了！你的表現非常優秀！👏';
    } else if (percentage >= 60) {
        message = '不錯！繼續加油！💪';
    } else if (percentage >= 40) {
        message = '還有進步空間，加油！📚';
    } else {
        message = '沒關係，多練習就會進步！🌟';
    }

    resultMessageElement.textContent = message;
}

function restartQuiz() {
    resultScreen.classList.add('hidden');
    startScreen.classList.remove('hidden');
    scoreElement.textContent = '0';
}

startBtn.addEventListener('click', startQuiz);
nextBtn.addEventListener('click', nextQuestion);
restartBtn.addEventListener('click', restartQuiz);
