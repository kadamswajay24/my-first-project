const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');

// Import Route Files
const busRoutes = require('./routes/busRoutes');
const passengerRoutes = require('./routes/passengerRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const tripRoutes = require('./routes/tripRoutes');
// Import router and middleware from authRoutes
const authRoutes = require('./routes/authRoutes').router; 

const app = express();
const PORT = 3000;

// IMPORTANT: Replace this with your actual MongoDB connection string
const MONGO_URI = 'mongodb://localhost:27017/BusManagementDB';

// --- Middleware Setup ---
app.use(bodyParser.json());

// Enable CORS for frontend access
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization'); 
    next();
});

// Serve the static frontend files (public/index.html - Assuming it's served from the root)
app.use(express.static('public'));


// --- MongoDB Connection ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected successfully!'))
    .catch(err => console.error('MongoDB connection error:', err));


// --- API Routes ---
app.use('/api/auth', authRoutes); 
app.use('/api/bus', busRoutes);
app.use('/api/passenger', passengerRoutes);
app.use('/api/ticket', ticketRoutes);
app.use('/api/trip', tripRoutes);

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`Frontend available at http://localhost:${PORT}/index.html`);
});
