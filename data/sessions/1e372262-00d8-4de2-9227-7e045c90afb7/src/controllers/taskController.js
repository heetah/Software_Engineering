const fs = require('fs');
const path = require('path');
const tasksFilePath = path.join(__dirname, '../tasks.json');

exports.listTasks = (req, res) => {
    fs.readFile(tasksFilePath, (err, data) => {
        if (err) {
            res.status(500).send('Error reading tasks data.');
            return;
        }
        res.json(JSON.parse(data));
    });
};

exports.createTask = (req, res) => {
    const newTask = req.body;
    fs.readFile(tasksFilePath, (err, data) => {
        if (err) {
            res.status(500).send('Error reading tasks data.');
            return;
        }
        const tasks = JSON.parse(data);
        tasks.push(newTask);
        fs.writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), (err) => {
            if (err) {
                res.status(500).send('Error saving new task.');
                return;
            }
            res.status(201).send('Task created.');
        });
    });
};

exports.getTask = (req, res) => {
    const taskId = req.params.id;
    fs.readFile(tasksFilePath, (err, data) => {
        if (err) {
            res.status(500).send('Error reading tasks data.');
            return;
        }
        const tasks = JSON.parse(data);
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
            res.status(404).send('Task not found.');
            return;
        }
        res.json(task);
    });
};

exports.updateTask = (req, res) => {
    const taskId = req.params.id;
    const taskUpdates = req.body;
    fs.readFile(tasksFilePath, (err, data) => {
        if (err) {
            res.status(500).send('Error reading tasks data.');
            return;
        }
        let tasks = JSON.parse(data);
        let taskIndex = tasks.findIndex(t => t.id === taskId);
        if (taskIndex === -1) {
            res.status(404).send('Task not found.');
            return;
        }
        tasks[taskIndex] = { ...tasks[taskIndex], ...taskUpdates };
        fs.writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), (err) => {
            if (err) {
                res.status(500).send('Error updating task.');
                return;
            }
            res.send('Task updated.');
        });
    });
};

exports.deleteTask = (req, res) => {
    const taskId = req.params.id;
    fs.readFile(tasksFilePath, (err, data) => {
        if (err) {
            res.status(500).send('Error reading tasks data.');
            return;
        }
        let tasks = JSON.parse(data);
        const newTasks = tasks.filter(t => t.id !== taskId);
        fs.writeFile(tasksFilePath, JSON.stringify(newTasks, null, 2), (err) => {
            if (err) {
                res.status(500).send('Error deleting task.');
                return;
            }
            res.send('Task deleted.');
        });
    });
};
