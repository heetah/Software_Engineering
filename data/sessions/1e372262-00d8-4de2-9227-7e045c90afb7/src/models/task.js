const fs = require('fs');
const path = require('path');
const tasksFilePath = path.join(__dirname, '../tasks.json');

class Task {
    static findAll(callback) {
        fs.readFile(tasksFilePath, (err, data) => {
            if (err) {
                callback(err, null);
                return;
            }
            callback(null, JSON.parse(data));
        });
    }

    static findById(id, callback) {
        fs.readFile(tasksFilePath, (err, data) => {
            if (err) {
                callback(err, null);
                return;
            }
            const tasks = JSON.parse(data);
            const task = tasks.find(t => t.id === id);
            callback(null, task);
        });
    }

    static create(newTask, callback) {
        Task.findAll((err, tasks) => {
            if (err) {
                callback(err);
                return;
            }
            tasks.push(newTask);
            fs.writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), err => {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null);
            });
        });
    }

    static update(id, taskUpdates, callback) {
        Task.findAll((err, tasks) => {
            if (err) {
                callback(err);
                return;
            }
            let taskIndex = tasks.findIndex(t => t.id === id);
            if (taskIndex === -1) {
                callback(new Error('Task not found'));
                return;
            }
            tasks[taskIndex] = { ...tasks[taskIndex], ...taskUpdates };
            fs.writeFile(tasksFilePath, JSON.stringify(tasks, null, 2), err => {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null);
            });
        });
    }

    static delete(id, callback) {
        Task.findAll((err, tasks) => {
            if (err) {
                callback(err);
                return;
            }
            const newTasks = tasks.filter(t => t.id !== id);
            fs.writeFile(tasksFilePath, JSON.stringify(newTasks, null, 2), err => {
                if (err) {
                    callback(err);
                    return;
                }
                callback(null);
            });
        });
    }
}

module.exports = Task;
