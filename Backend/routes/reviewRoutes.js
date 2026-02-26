const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// POST: Add a review and update Driver's Average Rating
router.post('/add', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        const { booking_id, rating, comment } = req.body;

        await connection.beginTransaction();

        // 1. Insert the Review
        await connection.execute(
            `INSERT INTO Reviews (booking_id, rating, comment) VALUES (?, ?, ?)`,
            [booking_id, rating, comment]
        );

        // 2. Find the Driver associated with this booking
        const [bookingInfo] = await connection.execute(`
            SELECT d.driver_id 
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Drivers d ON a.ambulance_id = d.ambulance_id
            WHERE b.booking_id = ?
        `, [booking_id]);

        if (bookingInfo.length > 0) {
            const driverId = bookingInfo[0].driver_id;

            // 3. Recalculate Driver's Average Rating
            // This is a great "Complex Query" for your project report
            await connection.execute(`
                UPDATE Drivers 
                SET rating = (
                    SELECT AVG(r.rating) 
                    FROM Reviews r
                    JOIN Bookings b ON r.booking_id = b.booking_id
                    JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
                    JOIN Drivers d2 ON a.ambulance_id = d2.ambulance_id
                    WHERE d2.driver_id = ?
                )
                WHERE driver_id = ?
            `, [driverId, driverId]);
        }

        await connection.commit();
        res.status(201).json({ message: "Review submitted and driver rating updated!" });

    } catch (err) {
        await connection.rollback();
        console.error("Review Error:", err.message);
        res.status(500).json({ error: "Could not submit review. Did you already review this trip?" });
    } finally {
        connection.release();
    }
});

// GET: Fetch reviews for a specific driver (to show in UI)
router.get('/driver/:driverId', async (req, res) => {
    try {
        const { driverId } = req.params;
        const [rows] = await pool.execute(`
            SELECT r.*, u.full_name AS reviewer_name
            FROM Reviews r
            JOIN Bookings b ON r.booking_id = b.booking_id
            JOIN Users u ON b.user_id = u.user_id
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            WHERE a.ambulance_id = (SELECT ambulance_id FROM Drivers WHERE driver_id = ?)
        `, [driverId]);
        
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;