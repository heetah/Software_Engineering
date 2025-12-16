let r = 255, g = 0, b = 100;
let savedColors = JSON.parse(localStorage.getItem('savedColors')) || [];

const colorDisplay = document.getElementById('colorDisplay');
const redSlider = document.getElementById('redSlider');
const greenSlider = document.getElementById('greenSlider');
const blueSlider = document.getElementById('blueSlider');
const redValue = document.getElementById('redValue');
const greenValue = document.getElementById('greenValue');
const blueValue = document.getElementById('blueValue');
const hexCode = document.getElementById('hexCode');
const rgbCode = document.getElementById('rgbCode');
const randomBtn = document.getElementById('randomBtn');
const saveBtn = document.getElementById('saveBtn');
const colorGrid = document.getElementById('colorGrid');

function updateColor() {
    const color = `rgb(${r}, ${g}, ${b})`;
    colorDisplay.style.backgroundColor = color;

    // 更新顯示值
    redValue.textContent = r;
    greenValue.textContent = g;
    blueValue.textContent = b;

    // 更新 HEX 和 RGB 代碼
    const hex = rgbToHex(r, g, b);
    hexCode.value = hex;
    rgbCode.value = color;
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function randomColor() {
    r = Math.floor(Math.random() * 256);
    g = Math.floor(Math.random() * 256);
    b = Math.floor(Math.random() * 256);

    redSlider.value = r;
    greenSlider.value = g;
    blueSlider.value = b;

    updateColor();
}

function saveColor() {
    const hex = rgbToHex(r, g, b);
    if (!savedColors.includes(hex)) {
        savedColors.push(hex);
        localStorage.setItem('savedColors', JSON.stringify(savedColors));
        displaySavedColors();
    }
}

function displaySavedColors() {
    colorGrid.innerHTML = '';
    savedColors.forEach((color, index) => {
        const colorDiv = document.createElement('div');
        colorDiv.className = 'saved-color';
        colorDiv.style.backgroundColor = color;
        colorDiv.title = color;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deleteColor(index);
        };

        colorDiv.onclick = () => {
            const rgb = hexToRgb(color);
            r = rgb.r;
            g = rgb.g;
            b = rgb.b;

            redSlider.value = r;
            greenSlider.value = g;
            blueSlider.value = b;

            updateColor();
        };

        colorDiv.appendChild(deleteBtn);
        colorGrid.appendChild(colorDiv);
    });
}

function deleteColor(index) {
    savedColors.splice(index, 1);
    localStorage.setItem('savedColors', JSON.stringify(savedColors));
    displaySavedColors();
}

function copyToClipboard(targetId) {
    const input = document.getElementById(targetId);
    input.select();
    document.execCommand('copy');

    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = '已複製！';
    setTimeout(() => {
        btn.textContent = originalText;
    }, 1500);
}

redSlider.addEventListener('input', (e) => {
    r = parseInt(e.target.value);
    updateColor();
});

greenSlider.addEventListener('input', (e) => {
    g = parseInt(e.target.value);
    updateColor();
});

blueSlider.addEventListener('input', (e) => {
    b = parseInt(e.target.value);
    updateColor();
});

randomBtn.addEventListener('click', randomColor);
saveBtn.addEventListener('click', saveColor);

document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-target');
        copyToClipboard(targetId);
    });
});

// 初始化
updateColor();
displaySavedColors();
