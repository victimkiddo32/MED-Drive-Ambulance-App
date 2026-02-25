const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. IMPROVED CORS (Allows your Vercel frontend to talk to Render)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// 2. DATABASE CONFIGURATION
const dbConfig = {
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '3ar8GbsUB4TTTf6.root',
    password: process.env.DB_PASSWORD || 'VIpnInb1NbDJkZMQ',
    database: process.env.DB_NAME || 'AmbulanceServiceDBMS',
    port: process.env.DB_PORT || 4000,
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false // REQUIRED for TiDB Cloud
    },
    connectTimeout: 20000 // 20 seconds
};


// 3. RECONNECTION LOGIC (Fixes the "Connection Closed" error)
let db;

function handleDisconnect() {
    // Create the connection object
    db = mysql.createConnection({
        host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
        user: process.env.DB_USER || '3ar8GbsUB4TTTf6.root',
        password: process.env.DB_PASSWORD || 'VIpnInb1NbDJkZMQ',
        database: process.env.DB_NAME || 'AmbulanceServiceDBMS',
        port: 4000,
        ssl: { rejectUnauthorized: false }
    });

    // Attempt to connect
    db.connect((err) => {
        if (err) {
            console.error('❌ Error connecting to DB:', err.message);
            setTimeout(handleDisconnect, 2000); // Wait 2 seconds and try again
        } else {
            console.log('✅ Connected to TiDB Cloud!');
        }
    });

    // Listen for errors (this catches the "Closed State" issue)
    db.on('error', (err) => {
        console.error('❌ DB Error:', err.message);
        if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
            console.log('🔄 Connection lost. Reconnecting...');
            handleDisconnect(); // Restart the connection
        } else {
            throw err;
        }
    });
}


handleDisconnect();

// 2. Fetch All Ambulances
app.get('/api/ambulances', (req, res) => {
    const sql = `
        SELECT a.ambulance_id AS id, a.vehicle_number, a.ambulance_type, a.status, 
               a.image_url, d.driver_name, h.hospital_name AS provider
        FROM Ambulances a
        LEFT JOIN Drivers d ON a.driver_id = d.driver_id
        LEFT JOIN Hospitals h ON a.hospital_id = h.hospital_id`;

    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results || []);
    });
});

// ---------------------------------------------------------
// 5. ROUTE: User Login
// ---------------------------------------------------------
app.post('/api/users/login', (req, res) => {
    const { email, password } = req.body;

    // We select user_id and name to store in the frontend localStorage
    const sql = `SELECT user_id, name, email FROM Users WHERE email = ? AND password = ?`;

    db.query(sql, [email, password], (err, results) => {
        if (err) {
            console.error("❌ Login SQL Error:", err.message);
            return res.status(500).json({ error: "Internal server error" });
        }

        if (results.length > 0) {
            // User found!
            res.json({
                success: true,
                user: results[0]
            });
        } else {
            // No user found with those credentials
            res.status(401).json({
                success: false,
                error: "Invalid email or password"
            });
        }
    });
});

// 3. Create Booking (Transaction based)
app.post('/api/bookings', (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination, fare } = req.body;

    db.beginTransaction((err) => {
        if (err) return res.status(500).json({ error: "Transaction Error" });

        // Change 'destination_hospital' to 'destination' (or vice versa) 
        // to match exactly what is in your TiDB table.
        const bookingSql = `INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, fare, status) 
                    VALUES (?, ?, ?, ?, ?, 'Pending')`;

        db.query(bookingSql, [user_id, ambulance_id, pickup_location, destination, fare], (err, result) => {
            if (err) return db.rollback(() => res.status(500).json({ error: err.message }));

            const updateAmbSql = `UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`;
            db.query(updateAmbSql, [ambulance_id], (err) => {
                if (err) return db.rollback(() => res.status(500).json({ error: "Update Failed" }));

                db.commit((err) => {
                    if (err) return db.rollback(() => res.status(500).json({ error: "Commit Failed" }));
                    console.log(`✅ Booking created for User ${user_id}. Ambulance ${ambulance_id} is now Busy.`);
                    res.json({ success: true, booking_id: result.insertId });
                });
            });
        });
    });
});

// 4. User Booking History
app.get('/api/bookings/user/:id', (req, res) => {
    const userId = req.params.id;

    if (!userId || userId === 'undefined') {
        return res.status(400).json({ error: "Invalid User ID provided" });
    }

    const sql = `SELECT booking_id, destination_hospital, status, fare, created_at 
                 FROM Bookings WHERE user_id = ? ORDER BY created_at DESC`;

    db.query(sql, [userId], (err, results) => {
        if (err) {
            console.error("❌ TiDB Query Error:", err.message);
            return res.status(500).json({
                error: "Database error",
                details: err.message
            });
        }
        res.json(results || []);
    });
});

const PORT = process.env.PORT || 10000; // Updated to 10000 to match Render's preference
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));