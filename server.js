require('dotenv').config(); // Must be at the very top
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Task = require('./models/Task'); // Import our new schema

const app = express();

app.use(cors());
app.use(express.json());

// ==========================================
// 1. DATABASE CONNECTION
// ==========================================
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err));

// ==========================================
// 2. GLOBAL MIDDLEWARE
// ==========================================
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
  next();
});

app.use((req, res, next) => {
  if ((req.method === 'POST' || req.method === 'PUT') && req.headers['content-type'] !== 'application/json') {
    return res.status(400).json({ error: 'Bad Request: Content-Type must be application/json' });
  }
  next();
});

// Middleware to validate MongoDB ObjectIds
const validateObjectId = (req, res, next) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid Task ID format' });
  }
  next();
};

// ==========================================
// 3. REST API ROUTES (CRUD via Mongoose)
// ==========================================

// READ ALL: Get all tasks (GET /tasks)
app.get('/tasks', async (req, res, next) => {
  try {
    const tasks = await Task.find();
    res.status(200).json(tasks);
  } catch (err) {
    next(err); // Pass to global error handler
  }
});

// READ ONE: Supplementary GET /tasks/:id endpoint
app.get('/tasks/:id', validateObjectId, async (req, res, next) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
});

// CREATE: Add a new task (POST /tasks)
app.post('/tasks', async (req, res, next) => {
  try {
    // Task.create() handles instantiation and saving in one step
    const newTask = await Task.create(req.body); 
    res.status(201).json(newTask);
  } catch (err) {
    next(err);
  }
});

// UPDATE: Modify a task (PUT /tasks/:id)
app.put('/tasks/:id', validateObjectId, async (req, res, next) => {
  try {
    // new: true returns the updated document instead of the old one
    // runValidators: true ensures updates respect the schema rules (like enum)
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    });
    
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json(updatedTask);
  } catch (err) {
    next(err);
  }
});

// DELETE: Remove a task (DELETE /tasks/:id)
app.delete('/tasks/:id', validateObjectId, async (req, res, next) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 4. ERROR HANDLING PIPELINE
// ==========================================

app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found. Please check your URL.' });
});

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  // Check if the error is a Mongoose Validation Error
  if (err.name === 'ValidationError') {
    // Extract and format clean error messages from Mongoose
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({ error: 'Validation Error', details: messages });
  }

  // Generic fallback for other errors
  console.error(err.stack); 
  res.status(500).json({ error: 'Internal Server Error: Something went wrong.' }); 
});

// Start the server using the port from .env, fallback to 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));