const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. IMPROVED CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'x-user-role']
}));
app.use(express.json());

// 2. DATABASE POOL (Better than single connection for TiDB/Render)
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
}).promise(); // Using promises for cleaner async/await code

// Test Connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Connected to TiDB Cloud Pool!');
        conn.release();
    })
    .catch(err => console.error('❌ DB Connection Failed:', err.message));

// ---------------------------------------------------------
// 3. ROUTES: AMBULANCES (Updated for 3NF)
// ---------------------------------------------------------
app.get('/api/ambulances', async (req, res) => {
    try {
        const sql = `
            SELECT a.ambulance_id AS id, a.vehicle_number, a.ambulance_type, a.status, 
                   a.image_url, u.full_name AS driver_name, p.company_name AS provider
            FROM Ambulances a
            LEFT JOIN Drivers d ON a.ambulance_id = d.ambulance_id
            LEFT JOIN Users u ON d.user_id = u.user_id
            LEFT JOIN Providers p ON a.provider_id = p.provider_id`;
        
        const [results] = await pool.query(sql);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 4. ROUTES: AUTHENTICATION (Updated for 3NF)
// ---------------------------------------------------------
app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // We select full_name and role to handle redirection
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

// ---------------------------------------------------------
// 5. ROUTES: BOOKINGS (With Atomic Transaction)
// ---------------------------------------------------------
app.post('/api/bookings', async (req, res) => {
    const { user_id, ambulance_id, pickup_location, destination_hospital, base_fare, final_fare } = req.body;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Insert Booking
        const bookingSql = `
            INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, base_fare, final_fare, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'Pending')`;
        const [result] = await conn.query(bookingSql, [user_id, ambulance_id, pickup_location, destination_hospital, base_fare, final_fare]);

        // Update Ambulance Status
        await conn.query(`UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`, [ambulance_id]);

        await conn.commit();
        res.json({ success: true, booking_id: result.insertId });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// ---------------------------------------------------------
// 6. ROUTES: USER HISTORY
// ---------------------------------------------------------
app.get('/api/bookings/user/:id', async (req, res) => {
    try {
        const [results] = await pool.query(
            `SELECT * FROM Bookings WHERE user_id = ? ORDER BY booking_time DESC`, 
            [req.params.id]
        );
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 7. ROUTES: PROVIDER MANAGEMENT (Added for your Provider HTML)
// ---------------------------------------------------------
app.post('/api/ambulances/add', async (req, res) => {
    const { provider_id, vehicle_number, ambulance_type, driver_name } = req.body;
    try {
        const sql = `INSERT INTO Ambulances (provider_id, vehicle_number, ambulance_type, status) VALUES (?, ?, ?, 'Available')`;
        await pool.query(sql, [provider_id, vehicle_number, ambulance_type]);
        res.status(201).json({ success: true, message: "Added successfully" });
    } catch (err) {
        res.status(500).json({ error: "Vehicle number already exists" });
    }
});


// ---------------------------------------------------------
// 8. ROUTES: ADMIN MANAGEMENT (Organizations)
// ---------------------------------------------------------

// GET all organizations with user counts
// 8. ROUTES: ADMIN MANAGEMENT (Organizations) - UPDATED COLUMN NAMES
app.get('/api/admin/organizations', async (req, res) => {
    try {
        const sql = `
            SELECT 
                org_id AS id, 
                org_name AS name, 
                email_domain AS domain, 
                discount_rate 
            FROM Organizations`;
        
        const [results] = await pool.query(sql);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// POST a new organization
app.post('/api/admin/organizations', async (req, res) => {
    // These names come from your Frontend 'orgData' object
    const { name, domain, discount_rate } = req.body; 

    try {
        // SQL updated with: org_name, email_domain, discount_rate
        const sql = `INSERT INTO Organizations (org_name, email_domain, discount_rate) VALUES (?, ?, ?)`;
        
        const [result] = await pool.query(sql, [name, domain, discount_rate]);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        console.error("SQL Save Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
// DELETE an organization
app.delete('/api/admin/organizations/:id', async (req, res) => {
    try {
        const sql = `DELETE FROM Organizations WHERE org_id = ?`;
        await pool.query(sql, [req.params.id]);
        res.json({ success: true, message: "Deleted" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Admin Dashboard Stats

app.get('/api/admin/stats', async (req, res) => {
    try {
        // 1. Total Revenue (Uses confirmed 'fare' column)
        const [revenueRes] = await pool.query(`SELECT SUM(fare) as total FROM Bookings WHERE status = 'Completed'`);
        
        // 2. Total Bookings (Uses confirmed 'booking_id' column)
        const [bookingsRes] = await pool.query(`SELECT COUNT(booking_id) as count FROM Bookings`);
        
        // 3. Total Organizations (Uses confirmed 'org_id' column)
        const [orgsRes] = await pool.query(`SELECT COUNT(org_id) as count FROM Organizations`);

        // 4. Safe check for Drivers (wrapped in try/catch to prevent 500 if table missing)
        let driversCount = 0;
        try {
            const [driversRes] = await pool.query(`SELECT COUNT(*) as count FROM Drivers`);
            driversCount = driversRes[0].count;
        } catch (e) {
            console.log("Drivers table not found, defaulting to 0");
        }

        // Send response in the format your HTML expects
        res.json({
            success: true,
            revenue: parseFloat(revenueRes[0].total || 0).toLocaleString(), 
            bookingsCount: bookingsRes[0].count || 0,
            driversCount: driversCount,
            orgsCount: orgsRes[0].count || 0
        });
    } catch (err) {
        console.error("Stats SQL Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/debug/columns', async (req, res) => {
    try {
        const [results] = await pool.query("DESCRIBE Organizations");
        res.json(results);
    } catch (err) {
        res.status(500).json(err);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));