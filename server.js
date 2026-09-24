require('dotenv').config(); // Must be at the very top
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const NodeCache = require('node-cache'); // Import node-cache
const Task = require('./models/Task'); 
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const jwt = require('jsonwebtoken'); 

const app = express();

app.use(cors());
app.use(express.json());

// Initialize node-cache with a 60-second Time-To-Live (TTL)
const taskCache = new NodeCache({ stdTTL: 60 });

// Debug tracking for cache performance
let cacheStats = { hits: 0, misses: 0 };

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
// 3. AUTHENTICATION ROUTES
// ==========================================

// POST /register - Create a new user
app.post('/register', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "A user with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      email: email,
      password: hashedPassword
    });
    
    await newUser.save();

    res.status(201).json({ message: "User registered successfully!" });

  } catch (err) {
    next(err);
  }
});

// POST /login - Authenticate a user and return a JWT
app.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid credentials." });
    }

    const token = jwt.sign(
      { id: user._id }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );

    res.status(200).json({ 
      message: "Login successful!", 
      token: token 
    });

  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3.5 AUTHENTICATION MIDDLEWARE
// ==========================================
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next(); 
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

// ==========================================
// 4. REST API ROUTES (With In-Memory Caching)
// ==========================================

// READ ALL: Get all tasks (GET /tasks) - CACHED
app.get('/tasks', authMiddleware, async (req, res, next) => {
  try {
    const cachedTasks = taskCache.get('all_tasks');

    if (cachedTasks) {
      cacheStats.hits++;
      console.log('Cache HIT: Returning all tasks from node-cache');
      return res.status(200).json(cachedTasks);
    }

    cacheStats.misses++;
    console.log('Cache MISS: Fetching all tasks from MongoDB');
    const tasks = await Task.find();

    // Store fetched tasks in cache
    taskCache.set('all_tasks', tasks);
    res.status(200).json(tasks);
  } catch (err) {
    next(err); 
  }
});

// READ ONE: Single task endpoint (GET /tasks/:id) - CACHED
app.get('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
  try {
    const cacheKey = `task_${req.params.id}`;
    const cachedTask = taskCache.get(cacheKey);

    if (cachedTask) {
      cacheStats.hits++;
      console.log(`Cache HIT: Returning task ${req.params.id} from node-cache`);
      return res.status(200).json(cachedTask);
    }

    cacheStats.misses++;
    console.log(`Cache MISS: Fetching task ${req.params.id} from MongoDB`);
    const task = await Task.findById(req.params.id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Store fetched task in cache
    taskCache.set(cacheKey, task);
    res.status(200).json(task);
  } catch (err) {
    next(err);
  }
});

// CREATE: Add a new task (POST /tasks) - INVALIDATES CACHE
app.post('/tasks', authMiddleware, async (req, res, next) => {
  try {
    const newTask = await Task.create(req.body);

    // Invalidate main list cache so fresh data is loaded on next GET
    taskCache.del('all_tasks');
    console.log('Cache INVALIDATED: "all_tasks" key deleted due to POST');

    res.status(201).json(newTask);
  } catch (err) {
    next(err);
  }
});

// UPDATE: Modify a task (PUT /tasks/:id) - INVALIDATES CACHE
app.put('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(req.params.id, req.body, { 
      new: true, 
      runValidators: true 
    });
    
    if (!updatedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Invalidate both main list and specific item cache
    taskCache.del('all_tasks');
    taskCache.del(`task_${req.params.id}`);
    console.log(`Cache INVALIDATED: Keys deleted due to PUT on task ${req.params.id}`);

    res.status(200).json(updatedTask);
  } catch (err) {
    next(err);
  }
});

// DELETE: Remove a task (DELETE /tasks/:id) - INVALIDATES CACHE
app.delete('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Invalidate both main list and specific item cache
    taskCache.del('all_tasks');
    taskCache.del(`task_${req.params.id}`);
    console.log(`Cache INVALIDATED: Keys deleted due to DELETE on task ${req.params.id}`);

    res.status(200).json({ message: 'Task deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 5. DEBUG ENDPOINT FOR CACHE STATS
// ==========================================
app.get('/cache/stats', (req, res) => {
  res.status(200).json({
    statistics: cacheStats,
    cachedKeys: taskCache.keys(),
    ttlSeconds: 60
  });
});

// ==========================================
// 6. ERROR HANDLING PIPELINE
// ==========================================

app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found. Please check your URL.' });
});

app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map(val => val.message);
    return res.status(400).json({ error: 'Validation Error', details: messages });
  }

  console.error(err.stack); 
  res.status(500).json({ error: 'Internal Server Error: Something went wrong.' }); 
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));