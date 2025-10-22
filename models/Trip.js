const mongoose = require('mongoose');
const { Schema } = mongoose;

const TripSchema = new Schema({
    bus_id: {
        type: Schema.Types.ObjectId,
        ref: 'Bus',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    departure_time: {
        type: String, // e.g., "08:00"
        required: true
    },
    // total_seats is taken from the Bus model upon creation but stored here for snapshot
    total_seats: { 
        type: Number,
        required: true,
        min: 1
    },
    // available_seats is updated atomically during booking/cancellation
    available_seats: {
        type: Number,
        required: true,
        default: function() {
            // Default to total_seats on creation
            return this.total_seats;
        }
    }
});

/**
 * Crucial check to prevent Mongoose from overwriting the Trip model.
 */
const Trip = mongoose.models.Trip || mongoose.model('Trip', TripSchema);
module.exports = Trip;
