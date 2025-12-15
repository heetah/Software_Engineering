// 簡單測試
const code = 'async function handleSaveNote(event, { filename, content }) {';
const match = code.match(/async\s+function\s+handleSaveNote\s*\([^,]+,\s*({[^}]+}|\w+)/i);
console.log('Match:', match ? match[1] : 'no match');

// 測試函數查找
function testFind() {
  const content = `
async function handleSaveNote(event, { filename, content }) {
    if (!filename) {
        return { success: false };
    }
}
  `;
  
  const functionName = 'handleSaveNote';
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`async\\s+function\\s+${escaped}\\s*\\([^,]+,\\s*({[^}]+}|\\w+)`, 'i');
  const match = content.match(pattern);
  
  if (match) {
    console.log('找到函數！');
    console.log('參數:', match[1]);
  } else {
    console.log('未找到函數');
  }
}

testFind();
