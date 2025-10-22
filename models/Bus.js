const mongoose = require('mongoose');

// Define the Bus Schema
const BusSchema = new mongoose.Schema({
    // MongoDB generates _id automatically
    type: {
        type: String,
        required: true,
        enum: ['AC', 'Non-AC', 'Sleeper', 'Deluxe'],
        trim: true
    },
    source: {
        type: String,
        required: true,
        trim: true
    },
    destination: {
        type: String,
        required: true,
        trim: true
    },
    total_seats: {
        type: Number,
        required: true,
        min: 1
    },
    fare: {
        type: Number,
        required: true,
        min: 0 // Fare cannot be negative
    }
});

/**
 * Mongoose overwrite check to prevent the 'OverwriteModelError'.
 * This is crucial when using multiple models that reference each other.
 */
const Bus = mongoose.models.Bus || mongoose.model('Bus', BusSchema);
module.exports = Bus;
