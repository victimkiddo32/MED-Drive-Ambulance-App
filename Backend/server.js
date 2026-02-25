const express = require('express');
const mysql = require('mysql2');
const cors = require('cors'); // Recommended for linking frontend
const app = express();

app.use(cors());
app.use(express.json());

// 1. Database Connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'your_password', // Replace with your actual password
    database: 'ambulance_service_db'
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to database:', err.stack);
        return;
    }
    console.log('Connected to MySQL/TiDB as id ' + db.threadId);
});

// ---------------------------------------------------------
// 2. FRONTEND LINK: Get Nearest Available Ambulances
// ---------------------------------------------------------
app.get('/api/find-ambulance', (req, res) => {
    // These come from the frontend (e.g., browser geolocation)
    const { lat, lng } = req.query;

    const sql = `
        SELECT a.ambulance_id, a.vehicle_number, a.ambulance_type, h.hospital_name,
        (6371 * acos(cos(radians(?)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(?)) + 
        sin(radians(?)) * sin(radians(a.lat)))) AS distance_km
        FROM Ambulances a
        JOIN Hospitals h ON a.hospital_id = h.hospital_id
        WHERE a.status = 'Available'
        ORDER BY distance_km ASC LIMIT 3`;

    db.query(sql, [lat, lng, lat], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ---------------------------------------------------------
// 3. FRONTEND LINK: Submit a Booking Request
// ---------------------------------------------------------
app.post('/api/book-ambulance', (req, res) => {
    const { user_id, ambulance_id, pickup, destination, fare } = req.body;

    // Use a Transaction to ensure data consistency
    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ error: "Transaction Error" });

        const bookingSql = `INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare, status) 
                            VALUES (?, ?, ?, ?, ?, 'Pending')`;
        
        db.query(bookingSql, [user_id, ambulance_id, pickup, destination, fare], (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: "Booking Failed" }));

            // Mark ambulance as 'Busy' so others can't book it
            const updateAmbSql = `UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`;
            
            db.query(updateAmbSql, [ambulance_id], (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: "Status Update Failed" }));

                db.commit((err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: "Commit Failed" }));
                    res.json({ success: true, booking_id: result.insertId });
                });
            });
        });
    });
});

// ---------------------------------------------------------
// 4. FRONTEND LINK: Admin Dashboard View
// ---------------------------------------------------------
app.get('/api/admin/availability', (req, res) => {
    // Calls the View we created earlier
    db.query('SELECT * FROM AmbulanceAvailability', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});