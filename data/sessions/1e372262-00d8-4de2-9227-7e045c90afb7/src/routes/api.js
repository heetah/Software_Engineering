const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');

router.get('/tasks', taskController.listTasks);
router.post('/tasks', taskController.createTask);
router.get('/tasks/:id', taskController.getTask);
router.put('/tasks/:id', taskController.updateTask);
router.delete('/tasks/:id', taskController.deleteTask);

router.use((req, res, next) => {
    res.status(404).send('Not Found');
});

router.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Server Error');
});

module.exports = router;
