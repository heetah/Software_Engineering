const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('colorPicker');
const sizeSlider = document.getElementById('sizeSlider');
const sizeValue = document.getElementById('sizeValue');
const eraserBtn = document.getElementById('eraserBtn');
const clearBtn = document.getElementById('clearBtn');
const saveBtn = document.getElementById('saveBtn');

// Set canvas size
canvas.width = 800;
canvas.height = 600;

// State
let isDrawing = false;
let color = '#000000';
let size = 5;
let isEraser = false;

// Event Listeners
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseout', stopDrawing);

colorPicker.addEventListener('input', (e) => {
    color = e.target.value;
    isEraser = false;
    eraserBtn.classList.remove('active');
});

sizeSlider.addEventListener('input', (e) => {
    size = e.target.value;
    sizeValue.textContent = size;
});

eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active');
});

clearBtn.addEventListener('click', () => {
    if (confirm('確定要清除畫布嗎？')) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
});

saveBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = 'drawing.png';
    link.href = canvas.toDataURL();
    link.click();
});

// Drawing functions
function startDrawing(e) {
    isDrawing = true;
    draw(e);
}

function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
}

function draw(e) {
    if (!isDrawing) return;

    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.strokeStyle = isEraser ? '#ffffff' : color;

    // Get mouse position relative to canvas
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
}
