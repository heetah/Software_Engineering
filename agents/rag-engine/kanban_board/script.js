let tasks = JSON.parse(localStorage.getItem('kanbanTasks')) || [];
let draggedTask = null;

const addTaskBtn = document.getElementById('addTaskBtn');
const modal = document.getElementById('modal');
const saveBtn = document.getElementById('saveBtn');
const cancelBtn = document.getElementById('cancelBtn');
const taskInput = document.getElementById('taskInput');
const columns = {
    todo: document.querySelector('#todo .task-list'),
    'in-progress': document.querySelector('#in-progress .task-list'),
    done: document.querySelector('#done .task-list')
};

// Initialize
renderTasks();

function saveTasks() {
    localStorage.setItem('kanbanTasks', JSON.stringify(tasks));
    updateCounts();
}

function updateCounts() {
    document.querySelector('#todo .count').textContent = tasks.filter(t => t.status === 'todo').length;
    document.querySelector('#in-progress .count').textContent = tasks.filter(t => t.status === 'in-progress').length;
    document.querySelector('#done .count').textContent = tasks.filter(t => t.status === 'done').length;
}

function createTaskElement(task) {
    const el = document.createElement('div');
    el.className = 'task-card';
    el.draggable = true;
    el.innerHTML = `
        ${task.content}
        <button class="delete-btn" onclick="deleteTask(${task.id})">×</button>
    `;

    el.addEventListener('dragstart', (e) => {
        draggedTask = task;
        e.dataTransfer.effectAllowed = 'move';
        el.style.opacity = '0.5';
    });

    el.addEventListener('dragend', () => {
        draggedTask = null;
        el.style.opacity = '1';
    });

    return el;
}

function renderTasks() {
    Object.values(columns).forEach(col => col.innerHTML = '');

    tasks.forEach(task => {
        if (columns[task.status]) {
            columns[task.status].appendChild(createTaskElement(task));
        }
    });

    updateCounts();
}

function allowDrop(e) {
    e.preventDefault();
}

function drop(e) {
    e.preventDefault();
    const column = e.target.closest('.column');
    if (!column || !draggedTask) return;

    const newStatus = column.id;
    if (draggedTask.status !== newStatus) {
        draggedTask.status = newStatus;
        saveTasks();
        renderTasks();
    }
}

// Modal functions
addTaskBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    taskInput.focus();
});

function closeModal() {
    modal.classList.add('hidden');
    taskInput.value = '';
}

cancelBtn.addEventListener('click', closeModal);

saveBtn.addEventListener('click', () => {
    const content = taskInput.value.trim();
    if (content) {
        tasks.push({
            id: Date.now(),
            content,
            status: 'todo'
        });
        saveTasks();
        renderTasks();
        closeModal();
    }
});

window.deleteTask = function (id) {
    if (confirm('確定要刪除此任務嗎？')) {
        tasks = tasks.filter(t => t.id !== id);
        saveTasks();
        renderTasks();
    }
};
