const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET all drivers
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT d.driver_id, u.full_name, u.phone_number, d.license_no, d.is_online, a.vehicle_number
            FROM Drivers d
            JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Ambulances a ON d.ambulance_id = a.ambulance_id
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET a single driver profile by User ID
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(`
            SELECT d.driver_id, u.full_name, u.email, u.phone_number, d.license_no, d.is_online, a.vehicle_number, a.status AS ambulance_status
            FROM Drivers d
            JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Ambulances a ON d.ambulance_id = a.ambulance_id
            WHERE d.user_id = ?
        `, [userId]);
        
        if (rows.length === 0) return res.status(404).json({ message: "Driver not found" });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. FIX: The Status Toggle Route (Matches your Frontend PATCH call)
router.patch('/status', async (req, res) => {
    const { driver_id, status } = req.body; 
    
    // Convert 'Active'/'Inactive' strings to 1/0 for the database is_online column
    const onlineValue = (status === 'Active' || status === true) ? 1 : 0;

    try {
        // We use user_id here because your localStorage 'userId' (30001) is likely the User ID
        const [result] = await pool.query(
            'UPDATE Drivers SET is_online = ? WHERE user_id = ?', 
            [onlineValue, driver_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Driver record not found" });
        }

        res.json({ success: true, message: `Status updated to ${status}` });
    } catch (err) {
        console.error("Database Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 4. Fetch Incoming/Active Booking for a Driver
router.get('/incoming/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        // Find booking where status is 'Pending' assigned to this driver's ambulance
        const [rows] = await pool.query(`
            SELECT b.* FROM Bookings b
            JOIN Drivers d ON b.ambulance_id = d.ambulance_id
            WHERE d.user_id = ? AND b.status = 'Pending'
            ORDER BY b.created_at DESC LIMIT 1
        `, [userId]);

        if (rows.length > 0) {
            res.json({ hasBooking: true, booking: rows[0] });
        } else {
            res.json({ hasBooking: false });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;