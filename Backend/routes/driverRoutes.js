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

// 2. GET a single driver profile by User ID (Important for Dashboard)
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

// 3. FIX: The Status Toggle Route
// Matches: PATCH /api/drivers/status
router.patch('/status', async (req, res) => {
    try {
        const { driver_id, status } = req.body;
        
        console.log(`Updating status for Driver/User ID ${driver_id} to ${status}`);

        // Convert 'Active' to 1 (Online) and 'Inactive' to 0 (Offline)
        const isOnline = (status === 'Active') ? 1 : 0;

        // Update both the status string AND the is_online boolean
        const [result] = await pool.query(
            'UPDATE Drivers SET is_online = ?, status = ? WHERE user_id = ?', 
            [isOnline, status, driver_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Driver record not found' });
        }

        res.status(200).json({ 
            success: true,
            message: 'Driver status updated successfully', 
            driver_id, 
            status 
        });

    } catch (error) {
        console.error('Error updating driver status:', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Fetch Incoming/Active Booking
router.get('/incoming/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const [rows] = await pool.query(`
            SELECT b.*, u.full_name AS customer_name, u.phone_number AS customer_phone
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN Drivers d ON b.ambulance_id = d.ambulance_id
            WHERE d.user_id = ? AND b.status = 'Pending'
            ORDER BY b.created_at DESC LIMIT 1
        `, [userId]);

        res.json({ hasBooking: rows.length > 0, booking: rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;