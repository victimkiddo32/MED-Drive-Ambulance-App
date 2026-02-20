const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Backend/routes/userRoutes.js
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        // Use the columns we fixed in your SQL (name, email, password, phone_number)
        const query = 'INSERT INTO Users (name, email, password, phone_number) VALUES (?, ?, ?, ?)';
        await pool.query(query, [name, email, password, phone]);
        res.status(201).json({ message: "Success" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login (Simplified for now)
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const [rows] = await pool.query('SELECT * FROM Users WHERE email = ? AND password = ?', [email, password]);
        if (rows.length > 0) {
            res.json({ user: rows[0] });
        } else {
            res.status(401).json({ message: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;