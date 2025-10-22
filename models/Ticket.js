const mongoose = require('mongoose');

// Define the Ticket Schema
const TicketSchema = new mongoose.Schema({
    // Links the ticket to a specific scheduled trip
    trip_id: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trip', 
        required: true
    },
    // Links the ticket to a registered passenger
    passenger_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Passenger', 
        required: true
    },
    // Journey date is stored for easy reference
    journey_date: {
        type: Date,
        required: true
    },
    seat_number: {
        type: Number,
        required: true,
        min: 1 // Seat numbers start at 1
    },
    // Fare is a snapshot of the price at the time of booking
    fare: {
        type: Number,
        required: true,
        min: 0
    }
});

// Create and export the Ticket Model
const Ticket = mongoose.model('Ticket', TicketSchema);
module.exports = Ticket;
