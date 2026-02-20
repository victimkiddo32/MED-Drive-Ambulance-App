const db = require('../config/db');

exports.createBooking = async (req, res) => {
    const { ambulance_id, user_id, pickup_location, destination } = req.body;
    try {
        const [result] = await db.query(
            'INSERT INTO Bookings (ambulance_id, user_id, pickup_location, destination, booking_status) VALUES (?, ?, ?, ?, "pending")',
            [ambulance_id, user_id, pickup_location, destination]
        );
        
        // Optionally update ambulance status to 'busy'
        await db.query('UPDATE Ambulances SET status = "busy" WHERE ambulance_id = ?', [ambulance_id]);

        res.status(201).json({ message: "Booking successful", bookingId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};