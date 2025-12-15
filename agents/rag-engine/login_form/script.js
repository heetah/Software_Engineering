// Show signup form
function showSignup() {
    event.preventDefault();
    document.getElementById('loginForm').classList.remove('active');
    document.getElementById('signupForm').classList.add('active');
}

// Show login form
function showLogin() {
    event.preventDefault();
    document.getElementById('signupForm').classList.remove('active');
    document.getElementById('loginForm').classList.add('active');
}

// Handle login
function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const remember = document.getElementById('rememberMe').checked;

    // Validation
    if (!email || !password) {
        alert('Please fill in all fields');
        return;
    }

    // Mock authentication (replace with real authentication)
    if (remember) {
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('userEmail', email);
    }

    alert(`Welcome back! Logging in as ${email}`);
    event.target.reset();
}

// Handle signup
function handleSignup(event) {
    event.preventDefault();

    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
        alert('Please fill in all fields');
        return;
    }

    if (password.length < 6) {
        alert('Password must be at least 6 characters long');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match');
        return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        alert('Please enter a valid email address');
        return;
    }

    // Mock registration (replace with real registration)
    alert(`Account created successfully for ${name}!\nPlease login to continue.`);
    event.target.reset();
    showLogin();
}

// Check remember me on load
document.addEventListener('DOMContentLoaded', () => {
    const rememberMe = localStorage.getItem('rememberMe');
    const userEmail = localStorage.getItem('userEmail');

    if (rememberMe === 'true' && userEmail) {
        document.getElementById('loginEmail').value = userEmail;
        document.getElementById('rememberMe').checked = true;
    }
});
