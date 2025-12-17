function updateClock() {
    const now = new Date();

    // Time
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const period = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    hours = String(hours).padStart(2, '0');

    document.getElementById('time').textContent = `${hours}:${minutes}:${seconds}`;
    document.getElementById('period').textContent = period;

    // Date
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
    const week = weekDays[now.getDay()];

    document.getElementById('date').textContent = `${year} 年 ${month} 月 ${day} 日 星期${week}`;
}

// Theme Switching
const buttons = document.querySelectorAll('.theme-btn');
const body = document.body;

// Load saved theme
const savedTheme = localStorage.getItem('clockTheme') || 'neon';
body.className = savedTheme;

buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        body.className = theme;
        localStorage.setItem('clockTheme', theme);
    });
});

setInterval(updateClock, 1000);
updateClock();
