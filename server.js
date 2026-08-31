require('dotenv').config(); // Must be at the very top
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Task = require('./models/Task'); 
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const jwt = require('jsonwebtoken'); 

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
// 3.5 AUTHENTICATION MIDDLEWARE (The Bouncer)
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
// 4. REST API ROUTES (CRUD via Mongoose)
// ==========================================

// READ ALL: Get all tasks (GET /tasks) - PROTECTED
app.get('/tasks', authMiddleware, async (req, res, next) => {
  try {
    const tasks = await Task.find();
    res.status(200).json(tasks);
  } catch (err) {
    next(err); 
  }
});

// READ ONE: Supplementary GET /tasks/:id endpoint - PROTECTED
app.get('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
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

// CREATE: Add a new task (POST /tasks) - PROTECTED
app.post('/tasks', authMiddleware, async (req, res, next) => {
  try {
    const newTask = await Task.create(req.body); 
    res.status(201).json(newTask);
  } catch (err) {
    next(err);
  }
});

// UPDATE: Modify a task (PUT /tasks/:id) - PROTECTED
app.put('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
  try {
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

// DELETE: Remove a task (DELETE /tasks/:id) - PROTECTED
app.delete('/tasks/:id', authMiddleware, validateObjectId, async (req, res, next) => {
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
// 5. ERROR HANDLING PIPELINE
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