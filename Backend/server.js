const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Database Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '3ar8GbsUB4TTTf6.root',
    password: process.env.DB_PASSWORD || 'VIpnInb1NbDJkZMQ',
    database: process.env.DB_NAME || 'AmbulanceServiceDBMS',
    port: process.env.DB_PORT || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false // This is required for TiDB Cloud
    }
});

db.connect((err) => {
    if (err) {
        console.error('❌ Database Connection Error:', err.message);
        return;
    }
    console.log('✅ Connected to TiDB Cloud!');
});

// ---------------------------------------------------------
// 2. NEW ROUTE: Fetch All Ambulances (Fixes your 404 error)
// ---------------------------------------------------------
app.get('/api/ambulances', (req, res) => {
    const sql = `
        SELECT a.ambulance_id AS id, a.vehicle_number, a.ambulance_type, a.status, 
               a.lat, a.lng, a.image_url, d.driver_name, h.hospital_name AS provider
        FROM Ambulances a
        LEFT JOIN Drivers d ON a.driver_id = d.driver_id
        LEFT JOIN Hospitals h ON a.hospital_id = h.hospital_id`;
    
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// ---------------------------------------------------------
// 3. UPDATED ROUTE: Create Booking (Matches dashboard field names)
// ---------------------------------------------------------
app.post('/api/bookings/create', (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination, fare } = req.body;

    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ error: "Transaction Error" });

        // Note: 'destination' from frontend maps to 'destination_hospital' in DB
        const bookingSql = `INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare, status) 
                            VALUES (?, ?, ?, ?, ?, 'Pending')`;
        
        db.query(bookingSql, [user_id, ambulance_id, pickup_location, destination, fare], (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

            const updateAmbSql = `UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`;
            db.query(updateAmbSql, [ambulance_id], (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: "Update Failed" }));

                db.commit((err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: "Commit Failed" }));
                    res.json({ success: true, booking_id: result.insertId });
                });
            });
        });
    });
});

// ---------------------------------------------------------
// 4. ROUTE: User Booking History
// ---------------------------------------------------------
app.get('/api/bookings/user/:id', (req, res) => {
    const sql = `SELECT * FROM Bookings WHERE user_id = ? ORDER BY created_at DESC`;
    db.query(sql, [req.params.id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on http://localhost:${PORT}`));