const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET all bookings (to see who has booked)
// GET all bookings with Driver and Ambulance details
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT b.booking_id, b.pickup_location, b.status, d.driver_name, a.vehicle_number
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Drivers d ON a.driver_id = d.driver_id
        `;
        const [rows] = await pool.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. POST a new booking
router.post('/create', async (req, res) => {
    try {
        const { user_id, ambulance_id, pickup_location, destination_hospital, fare } = req.body;
        
        const query = `INSERT INTO Bookings 
                       (user_id, ambulance_id, pickup_location, destination_hospital, booking_time, status, fare) 
                       VALUES (?, ?, ?, ?, NOW(), 'Pending', ?)`;

        const [result] = await pool.query(query, [user_id, ambulance_id, pickup_location, destination_hospital, fare]);
        
        res.status(201).json({ message: "Booking successful!", bookingId: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete a booking (Cancel Booking)
router.delete('/cancel/:id', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const { id } = req.params;

        // Get the ambulance_id before deleting the booking
        const [booking] = await connection.query('SELECT ambulance_id FROM Bookings WHERE booking_id = ?', [id]);
        
        if (booking.length > 0) {
            const ambId = booking[0].ambulance_id;
            // Delete booking
            await connection.query('DELETE FROM Bookings WHERE booking_id = ?', [id]);
            // Make ambulance available
            await connection.query('UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', [ambId]);
        }

        await connection.commit();
        res.json({ message: "Cancelled and ambulance is now available." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});


module.exports = router;