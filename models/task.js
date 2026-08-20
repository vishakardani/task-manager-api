const mongoose = require('mongoose');

// Define the Schema as per the Problem Statement and Supplementary Problems
const taskSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: [true, 'Task title is required'] 
  },
  description: { 
    type: String 
  },
  completed: { 
    type: Boolean, 
    default: false 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  // Supplementary: Priority field with strict enum values
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high'],
      message: '{VALUE} is not a valid priority level'
    },
    default: 'medium'
  }
});

// Supplementary: Pre-save hook to trim whitespace from the title
taskSchema.pre('save', function() {
  if (this.title) {
    this.title = this.title.trim();
  }
});

module.exports = mongoose.model('Task', taskSchema);