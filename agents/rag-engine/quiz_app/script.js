// Quiz data
const quizData = [
    {
        question: "What is the capital of France?",
        answers: ["London", "Berlin", "Paris", "Madrid"],
        correct: 2
    },
    {
        question: "Which planet is known as the Red Planet?",
        answers: ["Venus", "Mars", "Jupiter", "Saturn"],
        correct: 1
    },
    {
        question: "What is the largest ocean on Earth?",
        answers: ["Atlantic Ocean", "Indian Ocean", "Arctic Ocean", "Pacific Ocean"],
        correct: 3
    },
    {
        question: "Who painted the Mona Lisa?",
        answers: ["Vincent van Gogh", "Leonardo da Vinci", "Pablo Picasso", "Michelangelo"],
        correct: 1
    },
    {
        question: "What is the smallest prime number?",
        answers: ["0", "1", "2", "3"],
        correct: 2
    }
];

// Quiz state
let currentQuestion = 0;
let score = 0;
let selectedAnswer = null;

// Start quiz
function startQuiz() {
    currentQuestion = 0;
    score = 0;
    selectedAnswer = null;

    showScreen('quizScreen');
    displayQuestion();
}

// Display current question
function displayQuestion() {
    const question = quizData[currentQuestion];

    document.getElementById('question').textContent = question.question;
    document.getElementById('questionNumber').textContent = `Question ${currentQuestion + 1} of ${quizData.length}`;
    document.getElementById('score').textContent = `Score: ${score}`;

    // Update progress bar
    const progress = ((currentQuestion) / quizData.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;

    // Display answers
    const answersContainer = document.getElementById('answers');
    answersContainer.innerHTML = '';

    question.answers.forEach((answer, index) => {
        const button = document.createElement('button');
        button.className = 'answer-btn';
        button.textContent = answer;
        button.onclick = () => selectAnswer(index);
        answersContainer.appendChild(button);
    });

    document.getElementById('nextBtn').style.display = 'none';
    selectedAnswer = null;
}

// Select answer
function selectAnswer(index) {
    if (selectedAnswer !== null) return;

    selectedAnswer = index;
    const question = quizData[currentQuestion];
    const buttons = document.querySelectorAll('.answer-btn');

    buttons.forEach((btn, i) => {
        btn.disabled = true;

        if (i === question.correct) {
            btn.classList.add('correct');
        } else if (i === selectedAnswer) {
            btn.classList.add('incorrect');
        }
    });

    // Update score
    if (selectedAnswer === question.correct) {
        score++;
        document.getElementById('score').textContent = `Score: ${score}`;
    }

    document.getElementById('nextBtn').style.display = 'block';
}

// Next question
function nextQuestion() {
    currentQuestion++;

    if (currentQuestion < quizData.length) {
        displayQuestion();
    } else {
        showResults();
    }
}

// Show results
function showResults() {
    const percentage = Math.round((score / quizData.length) * 100);

    document.getElementById('finalScore').textContent = `${score}/${quizData.length}`;
    document.getElementById('percentage').textContent = `${percentage}%`;

    let message = '';
    if (percentage === 100) {
        message = '🎉 Perfect! You\'re a genius!';
    } else if (percentage >= 80) {
        message = '🌟 Excellent work! Great job!';
    } else if (percentage >= 60) {
        message = '👍 Good job! Keep it up!';
    } else if (percentage >= 40) {
        message = '📚 Not bad, but there\'s room for improvement!';
    } else {
        message = '💪 Keep practicing, you\'ll get better!';
    }

    document.getElementById('resultMessage').textContent = message;
    showScreen('resultScreen');
}

// Restart quiz
function restartQuiz() {
    startQuiz();
}

// Show specific screen
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}
