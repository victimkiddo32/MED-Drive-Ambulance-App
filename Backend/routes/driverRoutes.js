const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET all drivers (with names from Users table)
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                d.driver_id, 
                u.full_name, 
                u.phone_number, 
                d.license_no, 
                d.is_online, 
                a.vehicle_number
            FROM Drivers d
            JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Ambulances a ON d.ambulance_id = a.ambulance_id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET a single driver profile by User ID (Important for login)
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(`
            SELECT 
                d.driver_id, 
                u.full_name, 
                u.email, 
                u.phone_number, 
                d.license_no, 
                d.is_online, 
                a.vehicle_number,
                a.status AS ambulance_status
            FROM Drivers d
            JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Ambulances a ON d.ambulance_id = a.ambulance_id
            WHERE d.user_id = ?
        `, [userId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: "Driver profile not found" });
        }
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. UPDATE driver online status (Available for trips)
router.put('/toggle-online/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { is_online } = req.body; // Expecting true or false
        
        await pool.query('UPDATE Drivers SET is_online = ? WHERE user_id = ?', [is_online, userId]);
        
        res.json({ success: true, message: `Driver is now ${is_online ? 'Online' : 'Offline'}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. NEW: Fetch Active Booking for a Driver
// This is what the driver sees on their dashboard when a user books them
router.get('/active-trip/:ambulanceId', async (req, res) => {
    try {
        const { ambulanceId } = req.params;
        const [rows] = await pool.query(`
            SELECT b.*, u.full_name AS customer_name, u.phone_number AS customer_phone
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            WHERE b.ambulance_id = ? AND b.status IN ('Pending', 'In-Progress')
            ORDER BY b.booking_time DESC LIMIT 1
        `, [ambulanceId]);

        res.json(rows[0] || { message: "No active trips" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;