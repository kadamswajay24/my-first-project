const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();

const JWT_SECRET = 'SECRET_KEY'; // !!! CHANGE THIS IN PRODUCTION !!!

// Middleware function to check if the user is authenticated
function isAuth(req, res, next) {
  const token = req.headers.authorization;
  if (!token) return res.status(403).json({ error: 'No token provided.' });
  try {
    const tokenValue = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;
    const decoded = jwt.verify(tokenValue, JWT_SECRET);
    req.user = decoded; // { userId: user._id, role: user.role }
    next();
  } catch(err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// Middleware function to check if the user is an admin
function isAdmin(req, res, next) {
  // isAuth must run before isAdmin
  if (req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Admin access required.' });
}

// POST: Admin-Only User Registration (Explicit role assignment)
router.post('/admin/register', isAuth, isAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    
    if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role specified.' });
    }
    
    const existingUser = await User.findOne({ username });
    if (existingUser) {
         return res.status(400).json({ error: 'Username already taken.' });
    }

    const user = new User({ username, password, role });
    await user.save();
    res.status(201).json({ message: `User ${username} registered successfully as ${role}!` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


// POST: Standard User Registration (Defaults role to 'user')
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = new User({ username, password, role: 'user' }); 
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST: Login
router.post('/login', async (req, res) => {
  const { username, password, role } = req.body;

  const user = await User.findOne({ username });

  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ error: 'Invalid credentials or user not found!' });
  }

  // Check if the user's actual role matches the role selected in the UI
  if (role && user.role !== role) {
      return res.status(403).json({ error: `Login failed: Account is a '${user.role}' account, not a '${role}' account.` });
  }
  
  const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
  res.json({ token, role: user.role });
});


module.exports = { router, isAuth, isAdmin };
