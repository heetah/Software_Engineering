const editor = document.getElementById('editor');
const preview = document.getElementById('preview');
const charCount = document.getElementById('charCount');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');
const toolButtons = document.querySelectorAll('.tool-btn[data-md]');

// 從 localStorage 載入內容
const savedContent = localStorage.getItem('markdownContent');
if (savedContent) {
    editor.value = savedContent;
    updatePreview();
}

function updatePreview() {
    const markdownText = editor.value;

    // 使用 marked.js 轉換 Markdown
    if (typeof marked !== 'undefined') {
        preview.innerHTML = marked.parse(markdownText);
    } else {
        preview.textContent = markdownText;
    }

    // 更新字元計數
    charCount.textContent = `${markdownText.length} 字元`;

    // 儲存到 localStorage
    localStorage.setItem('markdownContent', markdownText);
}

function insertMarkdown(markdown) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const text = editor.value;
    const before = text.substring(0, start);
    const after = text.substring(end);

    editor.value = before + markdown + after;
    editor.focus();

    // 設定游標位置
    const newPosition = start + markdown.length;
    editor.setSelectionRange(newPosition, newPosition);

    updatePreview();
}

function clearEditor() {
    if (confirm('確定要清除所有內容嗎？')) {
        editor.value = '';
        updatePreview();
    }
}

function downloadHTML() {
    const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Document</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            line-height: 1.8;
            color: #333;
        }
        h1, h2, h3, h4, h5, h6 {
            margin: 1em 0 0.5em;
        }
        h1 {
            border-bottom: 2px solid #667eea;
            padding-bottom: 0.3em;
        }
        h2 {
            border-bottom: 1px solid #e0e0e0;
            padding-bottom: 0.3em;
        }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Courier New', monospace;
            color: #e91e63;
        }
        pre {
            background: #282c34;
            color: #abb2bf;
            padding: 15px;
            border-radius: 6px;
            overflow-x: auto;
        }
        pre code {
            background: none;
            color: #abb2bf;
            padding: 0;
        }
        blockquote {
            border-left: 4px solid #667eea;
            padding-left: 1em;
            margin: 1em 0;
            color: #666;
            font-style: italic;
        }
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1em 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }
        th {
            background: #667eea;
            color: white;
        }
        img {
            max-width: 100%;
            height: auto;
        }
    </style>
</head>
<body>
${preview.innerHTML}
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'document.html';
    a.click();
    URL.revokeObjectURL(url);
}

editor.addEventListener('input', updatePreview);
clearBtn.addEventListener('click', clearEditor);
downloadBtn.addEventListener('click', downloadHTML);

toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const markdown = btn.getAttribute('data-md');
        insertMarkdown(markdown);
    });
});

// 支援 Tab 鍵
editor.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
        insertMarkdown('    ');
    }
});

// 初始化預覽
updatePreview();
