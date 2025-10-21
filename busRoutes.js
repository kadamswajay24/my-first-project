const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Trip = require('../models/Trip'); 
const { isAuth, isAdmin } = require('./authRoutes'); 

// Utility for sending error responses
const sendError = (res, statusCode, message) => {
    console.error(`[Bus API Error ${statusCode}]: ${message}`);
    res.status(statusCode).json({ message, errors: [message] });
};

// POST: Add a new bus route (Admin only)
router.post('/', isAuth, isAdmin, async (req, res) => {
    try {
        const bus = new Bus(req.body);
        await bus.save(); 
        res.status(201).json(bus);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to add bus route.');
    }
});

// GET: View all buses (All authenticated users for trip creation/viewing)
router.get('/', isAuth, async (req, res) => {
    try {
        const buses = await Bus.find({});
        res.status(200).json(buses);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve bus routes.');
    }
});

// GET: View single bus route (All authenticated users)
router.get('/:id', isAuth, async (req, res) => {
    try {
        const bus = await Bus.findById(req.params.id);
        if (!bus) {
            return sendError(res, 404, 'Bus route not found.');
        }
        res.status(200).json(bus);
    } catch (err) {
        sendError(res, 500, 'Failed to retrieve bus route details.');
    }
});


// PUT: Update bus route details (Admin only)
router.put('/:id', isAuth, isAdmin, async (req, res) => {
    try {
        const updatedBus = await Bus.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });

        if (!updatedBus) {
            return sendError(res, 404, 'Bus route not found.');
        }

        res.status(200).json(updatedBus);
    } catch (err) {
        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(el => el.message);
            return sendError(res, 400, `Validation failed: ${errors.join(', ')}`);
        }
        sendError(res, 500, 'Failed to update bus route.');
    }
});

// DELETE: Delete a bus route (Admin only)
router.delete('/:id', isAuth, isAdmin, async (req, res) => {
    try {
        // Prevent deletion if scheduled trips exist
        const existingTrips = await Trip.findOne({ bus_id: req.params.id });
        if (existingTrips) {
            return sendError(res, 409, 'Cannot delete bus route: Existing trips are scheduled for this route. Delete trips first.');
        }

        const bus = await Bus.findByIdAndDelete(req.params.id);
        if (!bus) {
            return sendError(res, 404, 'Bus route not found.');
        }

        res.status(200).json({ message: 'Bus route deleted successfully.' });
    } catch (err) {
        sendError(res, 500, 'Failed to delete bus route.');
    }
});

module.exports = router;
