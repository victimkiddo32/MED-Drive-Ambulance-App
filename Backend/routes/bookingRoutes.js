const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET: Fetch Detailed Booking History
router.get('/', async (req, res) => {
    const { provider_id, user_id } = req.query; // Filter based on who is logged in
    try {
        let query = `
            SELECT 
                b.booking_id, 
                u.full_name AS customer_name, 
                a.ambulance_type, 
                du.full_name AS driver_name, 
                b.pickup_location, 
                b.destination_hospital, 
                b.status, 
                b.final_fare AS fare, 
                b.booking_time
            FROM Bookings b
            JOIN Users u ON b.user_id = u.user_id
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            LEFT JOIN Drivers d ON a.ambulance_id = d.ambulance_id
            LEFT JOIN Users du ON d.user_id = du.user_id
        `;

        const params = [];
        if (provider_id) {
            query += ` WHERE a.provider_id = ?`;
            params.push(provider_id);
        } else if (user_id) {
            query += ` WHERE b.user_id = ?`;
            params.push(user_id);
        }

        query += ` ORDER BY b.booking_time DESC`;

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Dashboard Fetch Error:", error);
        res.status(500).json({ error: "Could not load booking history" });
    }
});

// 2. POST: Create Booking (Atomic Transaction)
router.post('/', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, base_fare, discount_applied, final_fare } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // Step A: Insert Booking with new 3NF columns
        const [result] = await connection.execute(
            `INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, base_fare, discount_applied, final_fare, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [user_id, ambulance_id, pickup_location, destination_hospital, base_fare, discount_applied, final_fare]
        );

        // Step B: Mark Ambulance as 'Busy'
        await connection.execute(
            `UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`,
            [ambulance_id]
        );

        await connection.commit();
        res.status(201).json({ 
            success: true, 
            booking_id: result.insertId 
        });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ success: false, message: "Booking failed." });
    } finally {
        connection.release();
    }
});

module.exports = router;