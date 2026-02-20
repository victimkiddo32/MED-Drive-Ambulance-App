const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST a new review
router.post('/add', async (req, res) => {
    try {
        const { booking_id, rating, comment } = req.body;
        const query = `INSERT INTO Reviews (booking_id, rating, comment) VALUES (?, ?, ?)`;
        await pool.query(query, [booking_id, rating, comment]);
        
        res.status(201).json({ message: "Review submitted! Thank you." });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;