const express = require('express');
const router = express.Router();
const Ticket = require('../models/Ticket');
const Passenger = require('../models/Passenger');
const Trip = require('../models/Trip'); 
const { isAuth, isAdmin } = require('./authRoutes');
const mongoose = require('mongoose');

// Utility for sending error responses and logging
const sendError = (res, statusCode, message, err = null) => {
    if (err) {
        console.error(`[Ticket API Error ${statusCode}]: ${message}`, err);
    }
    res.status(statusCode).json({ message, errors: [message] });
};

// Check if an ID string is a valid MongoDB ObjectId format
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// POST: Book a new ticket (Authenticated Required)
router.post('/', isAuth, async (req, res) => {
    let { trip_id, passenger_id, seat_number, fare } = req.body;
    
    try {
        // --- VALIDATION & TYPE CASTING ---
        seat_number = parseInt(seat_number);
        fare = parseFloat(fare);

        if (!trip_id || !isValidObjectId(trip_id)) {
             return sendError(res, 400, 'Invalid Trip ID format or missing trip_id.');
        }
        if (!passenger_id || !isValidObjectId(passenger_id)) {
             return sendError(res, 400, 'Invalid Passenger ID format or missing passenger_id.');
        }
        if (isNaN(seat_number) || seat_number <= 0) {
            return sendError(res, 400, 'Invalid seat number.');
        }
        // --- END VALIDATION ---

        // 1. Validate Trip, Passenger, and Seat availability
        const trip = await Trip.findById(trip_id).populate('bus_id');
        const passenger = await Passenger.findById(passenger_id);

        if (!trip || !trip.bus_id || !passenger) {
            return sendError(res, 404, 'Trip, Bus, or Passenger record not found.');
        }
        
        // Check ownership of passenger record before booking
        if (req.user.role !== 'admin' && passenger.owner_id.toString() !== req.user.userId) {
             return sendError(res, 403, 'You do not own this passenger record.');
        }

        if (trip.available_seats <= 0) {
            return sendError(res, 409, 'Booking failed: No available seats on this trip.');
        }
        if (seat_number > trip.bus_id.total_seats) {
            return sendError(res, 400, `Invalid seat number. Max seats is ${trip.bus_id.total_seats}.`);
        }
        // Fare check
        if (fare !== parseFloat(trip.bus_id.fare)) {
            return sendError(res, 400, `Fare mismatch. Expected $${trip.bus_id.fare.toFixed(2)}.`);
        }
        
        // Check if the seat is already occupied
        const isSeatOccupied = await Ticket.findOne({ trip_id, seat_number });
        if (isSeatOccupied) {
            return sendError(res, 409, `Seat number ${seat_number} is already booked on this trip.`);
        }

        // 2. Decrease available seats on the Trip record atomically
        const updatedTrip = await Trip.findByIdAndUpdate(
            trip_id,
            { $inc: { available_seats: -1 } },
            { new: true }
        );
        
        if (!updatedTrip || updatedTrip.available_seats < 0) { 
             // Restore seat count if it fell below zero due to concurrency
             if (updatedTrip) await Trip.findByIdAndUpdate(trip_id, { $inc: { available_seats: 1 } });
             return sendError(res, 409, 'Booking failed due to concurrent update or over-booking attempt.');
        }

        // 3. Create Ticket
        const ticket = new Ticket({ 
            trip_id, 
            passenger_id, 
            seat_number, 
            fare: trip.bus_id.fare,
            journey_date: trip.date 
        });
        await ticket.save();

        res.status(201).json(ticket);

    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, `Critical server error during ticket booking: ${err.message || 'Unknown exception'}`, err);
    }
});

// GET: View all tickets (Authenticated Required, filtered by owner for 'user')
router.get('/', isAuth, async (req, res) => {
    try {
        let query = {};
        
        // If the user is NOT admin, filter by owner
        if (req.user.role !== 'admin') {
            const ownedPassengers = await Passenger.find({ owner_id: req.user.userId }).select('_id');
            const passengerIds = ownedPassengers.map(p => p._id);
            query.passenger_id = { $in: passengerIds };
        }
        
        // Allow filtering by trip_id (used for seat map lookup)
        if (req.query.trip_id && isValidObjectId(req.query.trip_id)) {
            query.trip_id = req.query.trip_id;
        }

        const tickets = await Ticket.find(query);
        res.status(200).json(tickets);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve tickets.');
    }
});

// GET: View single ticket (Authenticated Required for printing lookup)
router.get('/:id', isAuth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return sendError(res, 400, 'Invalid ID format.');
        }
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return sendError(res, 404, 'Ticket not found.');
        }
        
        // Security check
        if (req.user.role !== 'admin') {
             const passenger = await Passenger.findById(ticket.passenger_id);
             if (!passenger || passenger.owner_id.toString() !== req.user.userId) {
                 return sendError(res, 403, 'Access denied: You can only view your own bookings.');
             }
        }
        
        res.status(200).json(ticket);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve ticket details.');
    }
});

// PUT: Update ticket details (Admin only, or restricted update for user)
router.put('/:id', isAuth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return sendError(res, 400, 'Invalid ID format.');
        }
        
        const existingTicket = await Ticket.findById(req.params.id);
        if (!existingTicket) {
            return sendError(res, 404, 'Ticket not found.');
        }
        
        // Ownership Check
        if (req.user.role !== 'admin') {
            const passenger = await Passenger.findById(existingTicket.passenger_id);
            if (!passenger || passenger.owner_id.toString() !== req.user.userId) {
                return sendError(res, 403, 'Access denied: You can only update tickets associated with your passengers.');
            }
        }
        
        // Non-admins cannot change critical trip data
        if (req.user.role !== 'admin') {
            delete req.body.trip_id;
            delete req.body.fare;
            delete req.body.seat_number;
            delete req.body.journey_date;
        }

        // Apply update
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        res.status(200).json(ticket);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to update ticket.');
    }
});

// DELETE: Cancel a ticket (Authenticated Required)
router.delete('/:id', isAuth, async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return sendError(res, 400, 'Invalid ID format.');
        }
        
        const ticket = await Ticket.findById(req.params.id);
        if (!ticket) {
            return sendError(res, 404, 'Ticket not found.');
        }

        // Ownership Check
        if (req.user.role !== 'admin') {
            const passenger = await Passenger.findById(ticket.passenger_id);
            if (!passenger || passenger.owner_id.toString() !== req.user.userId) {
                return sendError(res, 403, 'Access denied: You can only cancel tickets associated with your passengers.');
            }
        }
        
        // 1. Delete the ticket
        await Ticket.findByIdAndDelete(req.params.id);
        
        // 2. Increase available seats in the Trip record using $inc (atomic update)
        if (isValidObjectId(ticket.trip_id)) {
            await Trip.findByIdAndUpdate( 
                ticket.trip_id,
                { $inc: { available_seats: 1 } }
            );
        }

        res.status(200).json({ message: 'Ticket cancelled successfully. Seat restored.' });

    } catch (err) {
        sendError(res, 500, 'Failed to cancel ticket.');
    }
});

module.exports = router;
