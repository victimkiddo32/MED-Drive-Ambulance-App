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
app.patch('/api/drivers/status', (req, res) => {
    const { driver_id, status } = req.body;
    
    const sql = "UPDATE drivers SET status = ? WHERE driver_id = ?";
    db.query(sql, [status, driver_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Status updated" });
    });
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
    const { booking_id, ambulance_id, driver_id } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('UPDATE Bookings SET status = "Completed" WHERE booking_id = ?', [booking_id]);
        await conn.query('UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', [ambulance_id]);
        await conn.query('UPDATE Drivers SET status = "Active" WHERE driver_id = ?', [driver_id]);
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
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
app.get('/api/drivers/incoming/:id', (req, res) => {
    const driverId = req.params.id;
    
    // SQL: Join bookings and ambulances to find trips for THIS driver
    const sql = `
        SELECT b.* FROM bookings b
        JOIN ambulances a ON b.ambulance_id = a.ambulance_id
        WHERE a.driver_id = ? AND b.status = 'Pending'
        LIMIT 1
    `;

    db.query(sql, [driverId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            res.json({ hasBooking: true, booking: results[0] });
        } else {
            res.json({ hasBooking: false });
        }
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));