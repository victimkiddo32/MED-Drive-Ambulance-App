const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. IMPROVED CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*'); 
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-user-role');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// 2. DATABASE POOL
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com',
    user: process.env.DB_USER || '3ar8GbsUB4TTTf6.root',
    password: process.env.DB_PASSWORD || 'VIpnInb1NbDJkZMQ',
    database: process.env.DB_NAME || 'AmbulanceServiceDBMS',
    port: process.env.DB_PORT || 4000,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
}).promise();

// ---------------------------------------------------------
// 3. DRIVER STATUS TOGGLE (Matches frontend 3000x IDs)
// ---------------------------------------------------------
// Add this to your server.js
// Changed 'db.query' to 'pool.query' and used async/await to match your setup
app.patch('/api/drivers/status', async (req, res) => {
    const { driver_id, status } = req.body;
    try {
        const sql = "UPDATE drivers SET status = ? WHERE driver_id = ?";
        await pool.query(sql, [status, driver_id]);
        res.json({ success: true, message: "Status updated" });
    } catch (err) {
        console.error("Status Update Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 4. ROUTES: AMBULANCES
app.get('/api/ambulances', async (req, res) => {
    try {
        const sql = `
            SELECT 
                a.ambulance_id AS id, a.vehicle_number, a.ambulance_type, a.status, a.image_url, 
                d.name AS driver_name, d.rating AS driver_rating, p.company_name AS provider
            FROM Ambulances a
            LEFT JOIN Drivers d ON a.driver_id = d.driver_id
            LEFT JOIN Providers p ON a.provider_id = p.provider_id`;
        const [results] = await pool.query(sql);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookings/track/:id', async (req, res) => {
    try {
        const sql = `SELECT b.status, d.name as driver_name, d.phone as phone_number, a.vehicle_number, a.ambulance_type
                     FROM Bookings b
                     JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
                     JOIN Drivers d ON a.driver_id = d.driver_id
                     WHERE b.booking_id = ?`;
        const [rows] = await pool.query(sql, [req.params.id]);
        if (rows.length > 0) res.json({ success: true, data: rows[0] });
        else res.status(404).json({ success: false });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// 5. ROUTES: AUTHENTICATION
app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const sql = `
            SELECT u.user_id, u.full_name, u.email, u.role, o.discount_rate
            FROM Users u
            LEFT JOIN Organizations o ON u.org_id = o.org_id
            WHERE u.email = ? AND u.password = ?`;
        const [results] = await pool.query(sql, [email, password]);
        if (results.length > 0) {
            res.json({ success: true, user: results[0] });
        } else {
            res.status(401).json({ success: false, error: "Invalid credentials" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookings', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare } = req.body;
    try {
        const sql = `INSERT INTO bookings 
            (user_id, ambulance_id, pickup_location, destination_hospital, status, base_fare, fare) 
            VALUES (?, ?, ?, ?, 'Pending', ?, ?)`;
        
        const [result] = await pool.query(sql, [user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare]);
        
        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        console.error("Booking Creation Error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/bookings/incoming/:driverId', async (req, res) => {
    const { driverId } = req.params;
    try {
        // Find bookings where the assigned ambulance belongs to THIS driver
        const sql = `
            SELECT b.*, u.full_name as patient_name, u.phone_number as patient_phone
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Users u ON b.user_id = u.user_id
            WHERE a.driver_id = ? AND b.status = 'Pending'
            ORDER BY b.created_at DESC LIMIT 1`;
            
        const [rows] = await pool.query(sql, [driverId]);
        res.json({ success: true, data: rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ensure this is exactly as written here
app.get('/api/bookings/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log(`Fetching bookings for user: ${userId}`); // Add this for debugging
    try {
        const sql = `
            SELECT b.*, a.vehicle_number, a.ambulance_type 
            FROM Bookings b
            LEFT JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            WHERE b.user_id = ? 
            ORDER BY b.created_at DESC`;

        const [rows] = await pool.query(sql, [userId]);
        
        // Return an empty array [] instead of a 404 if no bookings exist
        res.json(rows); 
    } catch (err) {
        console.error("User Booking Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// 6. ROUTES: BOOKINGS
app.post('/api/bookings/accept', async (req, res) => {
    const { booking_id, ambulance_id, driver_id } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE Bookings SET status = "Accepted", driver_id = ? WHERE booking_id = ?', [driver_id, booking_id]);
        await conn.query('UPDATE Ambulances SET status = "Busy" WHERE ambulance_id = ?', [ambulance_id]);
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/bookings/complete', async (req, res) => {
    // 1. Destructure with default values to prevent undefined errors
    const { booking_id, ambulance_id, driver_id } = req.body;
    
    // Debug log to see what the frontend is actually sending
    console.log(`Completing Trip: Booking ${booking_id}, Amb ${ambulance_id}, Driver ${driver_id}`);

    if (!booking_id || !ambulance_id) {
        return res.status(400).json({ success: false, error: "Missing IDs" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 2. Update Booking
        await conn.query('UPDATE Bookings SET status = "Completed" WHERE booking_id = ?', [booking_id]);

        // 3. Update Ambulance (Used lowercase 'available' to match standard DB entries)
        const [ambResult] = await conn.query(
            'UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', 
            [ambulance_id]
        );

        // 4. Update Driver
        await conn.query('UPDATE Drivers SET status = "Active" WHERE driver_id = ?', [driver_id]);

        await conn.commit();

        console.log(`Ambulance ${ambulance_id} update status:`, ambResult.affectedRows > 0 ? "SUCCESS" : "FAILED (ID not found)");

        res.json({ 
            success: true, 
            message: "Ride completed", 
            ambUpdated: ambResult.affectedRows > 0 
        });
    } catch (err) {
        await conn.rollback();
        console.error("Completion Error:", err);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});


// SIMULATION ROUTE: Use this to move the ambulance via Postman or another tab
app.patch('/api/ambulances/move', async (req, res) => {
    const { ambulance_id, lat, lng } = req.body;
    try {
        await pool.query(
            "UPDATE Ambulances SET lat = ?, lng = ? WHERE ambulance_id = ?", 
            [lat, lng, ambulance_id]
        );
        res.json({ success: true, message: "Location updated" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}); 

app.get('/api/ambulances/driver/:driverId', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM Ambulances WHERE driver_id = ?", [req.params.driverId]);
        res.json({ success: true, ambulance: rows[0] });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. DRIVER INCOMING & STATS
app.get('/api/drivers/stats/:id', async (req, res) => {
    const driverId = req.params.id;
    try {
        const sql = `
            SELECT IFNULL(SUM(fare), 0) AS earnings, COUNT(*) AS trips 
            FROM Bookings 
            WHERE driver_id = ? AND status = 'Completed'`;
        const [rows] = await pool.query(sql, [driverId]);
        res.json({ success: true, earnings: rows[0].earnings, trips: rows[0].trips });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. DRIVER INCOMING BOOKINGS
// Add this to your server.js
// This route now uses your 'pool' and correctly joins tables to find pending trips
app.get('/api/drivers/incoming/:userId', async (req, res) => {
    const userId = req.params.userId;

    try {
        // Now we just query our "Virtual Table" (The View)
        const sql = `SELECT * FROM active_driver_requests WHERE driver_user_id = ? LIMIT 1`;
        
        const [rows] = await pool.query(sql, [userId]);

        if (rows.length > 0) {
            res.json({ success: true, hasBooking: true, booking: rows[0] });
        } else {
            res.json({ success: true, hasBooking: false });
        }
    } catch (err) {
        console.error("SQL View Error:", err.message);
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// 8. ROUTES: REGISTRATION
app.post('/api/users/register', async (req, res) => {
    // 1. Destructure using 'phone_number' to match your DB field exactly
    const { full_name, email, password, phone_number, role, address } = req.body;
    
    try {
        // 2. Use 'phone_number' in the SQL column list
        const sql = `INSERT INTO Users (full_name, email, password, phone_number, role, address) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        
        // 3. Pass the variables in the correct order
        const [result] = await pool.query(sql, [
            full_name, 
            email, 
            password, 
            phone_number, 
            role || 'User', 
            address || null
        ]);
        
        res.json({ success: true, userId: result.insertId });
    } catch (err) {
        console.error("Registration Error:", err);
        // If there's a duplicate email or phone, this will catch it
        res.status(400).json({ success: false, error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));