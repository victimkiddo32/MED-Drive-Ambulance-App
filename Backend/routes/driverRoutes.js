const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET all drivers (to see the list)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Drivers');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET a single driver profile by ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT * FROM Drivers WHERE driver_id = ?', [id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: "Driver not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE driver status (e.g., 'On Duty' or 'Off Duty')
router.put('/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        await pool.query('UPDATE Drivers SET status = ? WHERE driver_id = ?', [status, id]);
        res.json({ message: "Driver status updated successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;