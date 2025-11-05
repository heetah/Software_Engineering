document.getElementById('new-task').addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    addTask();
  }
});

function addTask() {
  var taskInput = document.getElementById('new-task');
  var taskValue = taskInput.value.trim();
  if (taskValue) {
    var li = document.createElement('li');
    li.textContent = taskValue;
    document.getElementById('task-list').appendChild(li);
    taskInput.value = ''; // 清空輸入框
  }
}
