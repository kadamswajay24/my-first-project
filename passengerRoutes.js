const express = require('express');
const router = express.Router();
const Passenger = require('../models/Passenger');
const Ticket = require('../models/Ticket');
const { isAuth, isAdmin } = require('./authRoutes'); 

// Utility for sending error responses
const sendError = (res, statusCode, message) => {
    console.error(`[Passenger API Error ${statusCode}]: ${message}`);
    res.status(statusCode).json({ message, errors: [message] });
};

// POST: Add a new passenger (Auth required, owner_id assigned)
router.post('/', isAuth, async (req, res) => {
    try {
        const passenger = new Passenger({
            ...req.body,
            owner_id: req.user.userId // Assign the current user's ID as owner
        });
        await passenger.save();
        res.status(201).json(passenger);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to add passenger.');
    }
});

// GET: View all passengers (Filtered by owner for 'user', all for 'admin')
router.get('/', isAuth, async (req, res) => {
    try {
        const { search } = req.query;
        let query = {};

        // If the user is NOT admin, only show records they own.
        if (req.user.role !== 'admin') {
            query.owner_id = req.user.userId;
        }

        if (search) {
            // Add search criteria to the existing ownership query
            query = {
                ...query,
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { contact: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const passengers = await Passenger.find(query);
        res.status(200).json(passengers);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve passengers.');
    }
});

// GET: View single passenger (Authenticated access required for ticket/printing lookup)
router.get('/:id', isAuth, async (req, res) => { 
    try {
        const passenger = await Passenger.findById(req.params.id);
        if (!passenger) {
            return sendError(res, 404, 'Passenger not found.');
        }
        
        // Security check: Only return if admin OR if requester is the owner
        if (req.user.role !== 'admin' && passenger.owner_id.toString() !== req.user.userId) {
             return sendError(res, 403, 'Access denied: You are not the owner of this passenger record.');
        }

        res.status(200).json(passenger);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve passenger details.');
    }
});

// PUT: Update passenger details (Auth and Ownership check required)
router.put('/:id', isAuth, async (req, res) => {
    try {
        const existingPassenger = await Passenger.findById(req.params.id);
        if (!existingPassenger) {
            return sendError(res, 404, 'Passenger not found.');
        }

        // Ownership Check: Only admin or owner can update
        if (req.user.role !== 'admin' && existingPassenger.owner_id.toString() !== req.user.userId) {
            return sendError(res, 403, 'Access denied: You can only update passengers you created.');
        }
        
        // Prevent owner_id change
        delete req.body.owner_id;

        const passenger = await Passenger.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        res.status(200).json(passenger);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to update passenger.');
    }
});

// DELETE: Delete a passenger (Auth and Ownership check required)
router.delete('/:id', isAuth, async (req, res) => {
    try {
        const passenger = await Passenger.findById(req.params.id);
        if (!passenger) {
            return sendError(res, 404, 'Passenger not found.');
        }

        // Ownership Check: Only admin or owner can delete
        if (req.user.role !== 'admin' && passenger.owner_id.toString() !== req.user.userId) {
            return sendError(res, 403, 'Access denied: You can only delete passengers you created.');
        }

        // Deletion Rule: Prevent deletion if tickets exist
        const existingTickets = await Ticket.findOne({ passenger_id: req.params.id });
        if (existingTickets) {
            return sendError(res, 409, 'Cannot delete passenger: Existing tickets are associated with this passenger.');
        }

        await Passenger.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: 'Passenger deleted successfully.' });
    } catch (err) {
        sendError(res, 500, 'Failed to delete passenger.');
    }
});

module.exports = router;
