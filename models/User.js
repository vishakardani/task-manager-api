const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'] // Validation Rule 1 & 2: Must be an email format
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long'] // Validation Rule 3: Minimum length
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);