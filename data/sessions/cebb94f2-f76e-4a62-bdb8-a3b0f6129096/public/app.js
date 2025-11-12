// 完整的 JavaScript 邏輯，包含事件處理和功能實現
document.getElementById('run-tests').addEventListener('click', function() {
  // 模擬測試結果
  const results = [
    { test: '功能測試 1', status: '通過' },
    { test: '功能測試 2', status: '失敗' },
    { test: '功能測試 3', status: '通過' }
  ];

  const resultsContainer = document.getElementById('results-container');
  resultsContainer.innerHTML = ''; // 清空之前的結果

  results.forEach(result => {
    const resultElement = document.createElement('div');
    resultElement.textContent = `${result.test}: ${result.status}`;
    resultElement.className = result.status === '通過' ? 'pass' : 'fail';
    resultsContainer.appendChild(resultElement);
  });
});
