const mongoose = require('mongoose');

// Define the Passenger Schema
const PassengerSchema = new mongoose.Schema({
    // MongoDB generates _id automatically
    name: {
        type: String,
        required: true,
        trim: true
    },
    age: {
        type: Number,
        required: true,
        min: 1 // Age must be at least 1
    },
    gender: {
        type: String,
        required: true,
        enum: ['Male', 'Female', 'Other']
    },
    contact: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        type: String,
        trim: true
    },
    // Owner ID is crucial for multi-user segregation (User/Passenger relationship)
    owner_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
});

// Create and export the Passenger Model
const Passenger = mongoose.model('Passenger', PassengerSchema);
module.exports = Passenger;
