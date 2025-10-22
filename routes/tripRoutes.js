const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Trip = require('../models/Trip');
const Bus = require('../models/Bus');
const Ticket = require('../models/Ticket');
const { isAuth, isAdmin } = require('./authRoutes'); 

// Utility for sending error responses and logging
const sendError = (res, statusCode, message, err = null) => {
    if (err) {
        console.error(`[Trip API Error ${statusCode}]: ${message}`, err);
    }
    res.status(statusCode).json({ message, errors: [message] });
};

// Check if an ID string is a valid MongoDB ObjectId format
const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// All routes below require authentication.
router.use(isAuth);

// GET: View all trips (Admin Only)
router.get('/', isAdmin, async (req, res) => {
    try {
        // Find all trips and populate the bus details for table rendering
        const trips = await Trip.find({}).populate('bus_id', 'source destination type total_seats fare');
        
        // Map the result to include source, destination, and bus_details in the main object
        const result = trips.map(trip => {
            if (!trip.bus_id) return null; // Handle case where bus_id reference is broken

            return {
                _id: trip._id,
                bus_id: trip.bus_id._id,
                source: trip.bus_id.source,
                destination: trip.bus_id.destination,
                departure_time: trip.departure_time,
                date: trip.date,
                available_seats: trip.available_seats,
                fare: trip.bus_id.fare,
                bus_details: {
                    type: trip.bus_id.type,
                    total_seats: trip.bus_id.total_seats
                }
            };
        }).filter(t => t !== null); // Filter out trips with broken bus references
        
        res.status(200).json(result);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve trip schedules.', err);
    }
});

// GET: Search available trips (Authenticated Users)
router.get('/search', async (req, res) => {
    try {
        const { date, source, destination } = req.query;
        
        if (!date || !source || !destination) {
            return sendError(res, 400, 'Missing search parameters: date, source, and destination are required.');
        }

        const searchDate = new Date(date);
        
        // 1. Find matching Bus routes
        const buses = await Bus.find({ 
            source: { $regex: source, $options: 'i' }, 
            destination: { $regex: destination, $options: 'i' } 
        });

        const busIds = buses.map(b => b._id);
        
        // 2. Find trips that use those buses on the specific date
        const trips = await Trip.find({
            bus_id: { $in: busIds },
            date: {
                 $gte: new Date(searchDate.setHours(0, 0, 0, 0)),
                 $lt: new Date(searchDate.setHours(24, 0, 0, 0))
            },
            available_seats: { $gt: 0 } // Only show trips with available seats
        }).populate('bus_id');

        // 3. Map results and structure the output
        const result = trips.map(trip => {
            if (!trip.bus_id) return null; // Filter out trips with broken bus references

            return {
                _id: trip._id,
                source: trip.bus_id.source,
                destination: trip.bus_id.destination,
                date: trip.date,
                departure_time: trip.departure_time,
                available_seats: trip.available_seats,
                fare: trip.bus_id.fare,
                bus_details: {
                    type: trip.bus_id.type,
                    total_seats: trip.bus_id.total_seats
                }
            };
        }).filter(t => t !== null);

        res.status(200).json(result);
    } catch (err) {
        sendError(res, 500, 'Failed to search for trips.', err);
    }
});

// GET: Single Trip Details (Authenticated Users)
router.get('/:id', async (req, res) => {
    try {
        if (!isValidObjectId(req.params.id)) {
            return sendError(res, 400, 'Invalid Trip ID format.');
        }

        const trip = await Trip.findById(req.params.id).populate('bus_id');

        if (!trip || !trip.bus_id) {
            return sendError(res, 404, 'Trip or its associated Bus Route not found.');
        }
        
        const result = {
            _id: trip._id,
            bus_id: trip.bus_id._id,
            source: trip.bus_id.source,
            destination: trip.bus_id.destination,
            date: trip.date,
            departure_time: trip.departure_time,
            available_seats: trip.available_seats,
            fare: trip.bus_id.fare,
            bus_details: {
                type: trip.bus_id.type,
                total_seats: trip.bus_id.total_seats
            }
        };

        res.status(200).json(result);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve trip details.', err);
    }
});


// POST: Add a new trip (Admin Only)
router.post('/', isAdmin, async (req, res) => {
    try {
        const { bus_id, date, departure_time } = req.body;
        
        const bus = await Bus.findById(bus_id);
        if (!bus) {
            return sendError(res, 404, 'Bus Route not found for the selected ID.');
        }

        const trip = new Trip({
            bus_id,
            date,
            departure_time,
            total_seats: bus.total_seats,
            available_seats: bus.total_seats 
        });
        await trip.save();
        res.status(201).json(trip);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to schedule new trip.', err);
    }
});

// PUT: Update trip details (Admin Only)
router.put('/:id', isAdmin, async (req, res) => {
    try {
        const updateData = req.body;
        // Prevent manual tampering of available_seats
        delete updateData.available_seats; 

        const trip = await Trip.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

        if (!trip) {
            return sendError(res, 404, 'Trip not found.');
        }
        res.status(200).json(trip);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to update trip schedule.', err);
    }
});

// DELETE: Delete a trip (Admin Only)
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        // Prevent deletion if tickets exist
        const existingTickets = await Ticket.findOne({ trip_id: req.params.id });
        if (existingTickets) {
            return sendError(res, 409, 'Cannot delete trip: Existing tickets are booked for this schedule.');
        }
        
        const trip = await Trip.findByIdAndDelete(req.params.id);
        if (!trip) {
            return sendError(res, 404, 'Trip not found.');
        }

        res.status(200).json({ message: 'Trip deleted successfully.' });
    } catch (err) {
        sendError(res, 500, 'Failed to delete trip.', err);
    }
});

module.exports = router;
