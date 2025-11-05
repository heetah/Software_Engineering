const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Basic CRUD operations for tasks
app.get('/tasks', (req, res) => {
  // Retrieve tasks from tasks.json
});

app.post('/tasks', (req, res) => {
  // Add a new task to tasks.json
});

app.put('/tasks/:id', (req, res) => {
  // Update a task in tasks.json
});

app.delete('/tasks/:id', (req, res) => {
  // Delete a task from tasks.json
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
