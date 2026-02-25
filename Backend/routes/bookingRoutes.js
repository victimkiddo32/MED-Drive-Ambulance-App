const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET: Fetch Detailed Booking History for Dashboard
// Uses a JOIN to show Customer and Driver names instead of just IDs
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                b.booking_id, 
                u.name AS customer_name, 
                a.ambulance_type, 
                d.driver_name, 
                b.pickup_location, 
                b.destination_hospital, 
                b.status, 
                b.fare, 
                b.created_at
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Drivers d ON a.driver_id = d.driver_id
            ORDER BY b.created_at DESC
        `);
        res.json(rows);
    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        res.status(500).json({ error: "Could not load booking history" });
    }
});

// 2. POST: Create Booking + Update Ambulance Status (Atomic Transaction)
router.post('/', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, fare } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Step A: Insert Booking
        const [result] = await connection.execute(
            `INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare, status)
             VALUES (?, ?, ?, ?, ?, 'Pending')`,
            [user_id, ambulance_id, pickup_location, destination_hospital, fare || 500.00]
        );

        // Step B: Mark Ambulance as 'Busy' immediately
        await connection.execute(
            `UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`,
            [ambulance_id]
        );

        await connection.commit();
        res.status(201).json({ 
            success: true, 
            message: "Booking confirmed and ambulance dispatched!", 
            booking_id: result.insertId 
        });

    } catch (error) {
        await connection.rollback();
        console.error("Booking Transaction Error:", error);
        res.status(500).json({ success: false, message: "Booking failed. Please try again." });
    } finally {
        connection.release();
    }
});

// 3. DELETE: Cancel Booking (With Status Reversion)
router.delete('/cancel/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // 1. Find which ambulance was assigned to this booking
        const [booking] = await connection.query('SELECT ambulance_id FROM Bookings WHERE booking_id = ?', [id]);
        
        if (booking.length > 0) {
            const ambId = booking[0].ambulance_id;
            
            // 2. Change status to 'Cancelled' instead of hard deleting (better for record keeping)
            await connection.query('UPDATE Bookings SET status = "Cancelled" WHERE booking_id = ?', [id]);
            
            // 3. Free up the ambulance
            await connection.query('UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', [ambId]);
            
            await connection.commit();
            res.json({ success: true, message: "Booking cancelled successfully." });
        } else {
            res.status(404).json({ error: "Booking not found." });
        }
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

module.exports = router;