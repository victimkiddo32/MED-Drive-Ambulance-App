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
// 3. DRIVER STATUS TOGGLE (FIXES THE 404 ERROR)
// ---------------------------------------------------------
app.patch('/api/drivers/status', async (req, res) => {
    const { driver_id, status } = req.body;
    try {
        // Map 'Active' to 1 (Online) and 'Inactive' to 0 (Offline)
        const isOnline = (status === 'Active') ? 1 : 0;
        
        const [result] = await pool.query(
            'UPDATE Drivers SET status = ?, is_online = ? WHERE driver_id = ?', 
            [status, isOnline, driver_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Driver not found" });
        }

        res.json({ success: true, message: `Driver status updated to ${status}` });
    } catch (err) {
        console.error("PATCH Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ---------------------------------------------------------
// 4. ROUTES: AMBULANCES
// ---------------------------------------------------------
app.get('/api/ambulances', async (req, res) => {
    try {
        const sql = `
            SELECT 
                a.ambulance_id AS id, 
                a.vehicle_number, 
                a.ambulance_type, 
                a.status, 
                a.image_url, 
                d.name AS driver_name, 
                d.rating AS driver_rating,
                p.company_name AS provider
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

app.post('/api/users/register', async (req, res) => {
    const { full_name, email, password, phone_number, role } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO Users (full_name, email, password, phone_number, role) VALUES (?, ?, ?, ?, ?)',
            [full_name, email, password, phone_number, role]
        );
        const newUserId = result.insertId;
        if (role === 'Driver') {
            await pool.query(
                'INSERT INTO Drivers (driver_id, name, status, is_online) VALUES (?, ?, "Inactive", 0)',
                [newUserId, full_name]
            );
        }
        res.status(201).json({ success: true, userId: newUserId });
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

app.post('/api/bookings', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare } = req.body;
    try {
        const [ambInfo] = await pool.query('SELECT driver_id FROM Ambulances WHERE ambulance_id = ?', [ambulance_id]);
        const assignedDriverId = ambInfo[0]?.driver_id;

        const sql = `INSERT INTO Bookings 
            (user_id, ambulance_id, driver_id, pickup_location, destination_hospital, base_fare, fare, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())`;
        
        const [result] = await pool.query(sql, [user_id, ambulance_id, assignedDriverId, pickup_location, destination_hospital, base_fare, fare]);
        await pool.query('UPDATE Ambulances SET status = "Busy" WHERE ambulance_id = ?', [ambulance_id]);
        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. DRIVER INCOMING & STATS
app.get('/api/drivers/incoming/:id', async (req, res) => {
    const driverId = req.params.id;
    try {
        // Look for bookings specifically assigned to this driver or broadcasted
        const [rows] = await pool.query(
            `SELECT * FROM Bookings 
             WHERE (driver_id = ? OR driver_id IS NULL) 
             AND status = 'Pending' LIMIT 1`, 
            [driverId]
        );
        res.json({ hasBooking: rows.length > 0, booking: rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));