document.getElementById('new-task').addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    addTask();
  }
});

function addTask() {
  var taskInput = document.getElementById('new-task');
  var newTask = taskInput.value.trim();
  if (newTask) {
    var li = document.createElement('li');
    li.textContent = newTask;
    document.getElementById('task-list').appendChild(li);
    taskInput.value = ''; // Clear input after adding
  }
}
