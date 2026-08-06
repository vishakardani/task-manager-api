const express = require('express');
const app = express();

// Built-in middleware to parse incoming JSON payloads
app.use(express.json());

// In-memory array for temporary storage (No database yet)
let tasks = [];
let currentId = 1;

// ==========================================
// 1. GLOBAL MIDDLEWARE
// ==========================================

// Request Logging Middleware: Logs method, URL, and timestamp
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next(); // Must call next() or the request hangs
});

// Supplementary: Reject requests without Content-Type: application/json on POST/PUT
app.use((req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type'] !== 'application/json') {
    return res.status(400).json({ error: 'Bad Request: Content-Type must be application/json' });
  }
  next();
});

// ==========================================
// 2. ROUTE-SPECIFIC MIDDLEWARE
// ==========================================

// Supplementary: Validates that the Task ID in the URL is a valid number
const validateTaskId = (req, res, next) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid Task ID format. Must be an integer.' });
  }
  req.taskId = id; // Pass the cleaned ID to the next function
  next();
};

// ==========================================
// 3. REST API ROUTES (CRUD)
// ==========================================

// READ: Get all tasks (GET /tasks)
app.get('/tasks', (req, res) => {
  res.status(200).json(tasks); // 200 OK
});

// CREATE: Add a new task (POST /tasks)
app.post('/tasks', (req, res) => {
  const { title, description } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const newTask = { 
    id: currentId++, 
    title, 
    description: description || '', 
    completed: false 
  };
  
  tasks.push(newTask);
  res.status(201).json(newTask); // 201 Created
});

// UPDATE: Modify a task (PUT /tasks/:id)
app.put('/tasks/:id', validateTaskId, (req, res) => {
  const taskIndex = tasks.findIndex(t => t.id === req.taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' }); // 404 Not Found
  }
  
  const { title, description, completed } = req.body;
  
  // Update only the provided fields
  tasks[taskIndex] = {
    ...tasks[taskIndex],
    title: title !== undefined ? title : tasks[taskIndex].title,
    description: description !== undefined ? description : tasks[taskIndex].description,
    completed: completed !== undefined ? completed : tasks[taskIndex].completed
  };
  
  res.status(200).json(tasks[taskIndex]);
});

// DELETE: Remove a task (DELETE /tasks/:id)
app.delete('/tasks/:id', validateTaskId, (req, res) => {
  const taskIndex = tasks.findIndex(t => t.id === req.taskId);
  
  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  tasks.splice(taskIndex, 1);
  res.status(200).json({ message: `Task ${req.taskId} deleted successfully` });
});

// ==========================================
// 4. ERROR HANDLING PIPELINE
// ==========================================

// Supplementary: 404 handler for undefined routes
// If a request makes it past all the routes above, the route doesn't exist.
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found. Please check your URL.' });
});

// Global Error Handling Middleware: MUST be the very last middleware
app.use((err, req, res, next) => {
  console.error(err.stack); // Logs the raw stack trace to the server console
  
  // Sends a clean, safe error message to the client (Security best practice!)
  res.status(500).json({ error: 'Internal Server Error: Something went wrong.' }); // 500 Server Error
});

// Start the server
app.listen(5000, () => console.log('Server running on port 5000'));