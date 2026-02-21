const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET all bookings (to see who has booked)
// GET all bookings with Driver and Ambulance details
router.get('/', async (req, res) => {
    try {
        // For now, we fetch all. Later you can use: 
        // SELECT * FROM Bookings WHERE user_id = ?
        const [rows] = await pool.execute('SELECT * FROM Bookings ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        console.error("Fetch History Error:", error);
        res.status(500).json({ error: "Could not load history" });
    }
});


// Route to create a new booking
router.post('/', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, fare } = req.body;

    try {
        const query = `
            INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare, status)
            VALUES (?, ?, ?, ?, ?, 'Pending')
        `;
        
        const [result] = await pool.execute(query, [
            user_id, 
            ambulance_id || 1, 
            pickup_location, 
            destination_hospital, 
            fare || 500.00
        ]);
        
        res.status(201).json({ 
            success: true, 
            message: "Booking confirmed!", 
            booking_id: result.insertId 
        });
    } catch (error) {
        console.error("Booking Error:", error);
        res.status(500).json({ success: false, message: "Database error" });
    }
});

module.exports = router;

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