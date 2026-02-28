const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

const app = express();

// 1. IMPROVED CORS

app.use(cors({
    origin: '*', // Allows all origins (good for development)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], // Added PATCH here
    allowedHeaders: ['Content-Type', 'x-user-role', 'Authorization']
}));
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

// Test Connection
pool.getConnection()
    .then(conn => {
        console.log('✅ Connected to TiDB Cloud Pool!');
        conn.release();
    })
    .catch(err => console.error('❌ DB Connection Failed:', err.message));

// ---------------------------------------------------------
// 3. ROUTES: AMBULANCES
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

// ---------------------------------------------------------
// 4. ROUTES: AUTHENTICATION
// ---------------------------------------------------------
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
                'INSERT INTO Drivers (driver_id, name, status) VALUES (?, ?, "Inactive")',
                [newUserId, full_name]
            );
        }
        res.status(201).json({ success: true, userId: newUserId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ---------------------------------------------------------
// 5. ROUTES: BOOKINGS
// ---------------------------------------------------------
app.post('/api/bookings/accept', async (req, res) => {
    const { booking_id, ambulance_id, driver_id } = req.body;
    
    // DEBUG: This will show up in your Render "Logs" tab
    console.log("Accepting Booking:", { booking_id, ambulance_id, driver_id });

    if (!booking_id || !driver_id) {
        return res.status(400).json({ error: "Missing booking_id or driver_id" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        
        // Use shorter status strings if your DB is tight on space
        await conn.query('UPDATE Bookings SET status = "Accepted", driver_id = ? WHERE booking_id = ?', [driver_id, booking_id]);
        await conn.query('UPDATE Ambulances SET status = "Busy" WHERE ambulance_id = ?', [ambulance_id]);
        
        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        console.error("DATABASE ERROR:", err.message); // This will tell you the column name!
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

// --- COMPLETE TRIP ROUTE ---
app.post('/api/bookings/complete', async (req, res) => {
    const { booking_id, ambulance_id, driver_id } = req.body;
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Mark Booking as Completed (This makes the earnings show up!)
        await conn.query('UPDATE Bookings SET status = "Completed" WHERE booking_id = ?', [booking_id]);

        // 2. Make Ambulance and Driver available for the next patient
        await conn.query('UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', [ambulance_id]);
        await conn.query('UPDATE Drivers SET status = "Active" WHERE driver_id = ?', [driver_id]);

        await conn.commit();
        res.json({ success: true, message: "Trip finalized successfully" });
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
        // 1. FIRST: Find out who is currently driving this specific ambulance
        const [ambInfo] = await pool.query(
            'SELECT driver_id FROM Ambulances WHERE ambulance_id = ?', 
            [ambulance_id]
        );

        const assignedDriverId = ambInfo[0]?.driver_id;

        // 2. SECOND: Insert the booking WITH that driver's ID immediately
        const sql = `INSERT INTO Bookings 
            (user_id, ambulance_id, driver_id, pickup_location, destination_hospital, base_fare, fare, status, created_at) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', NOW())`;
        
        const [result] = await pool.query(sql, [
            user_id, 
            ambulance_id, 
            assignedDriverId, // This locks Jashim or Nurul to this specific trip!
            pickup_location, 
            destination_hospital, 
            base_fare, 
            fare
        ]);

        // 3. THIRD: Mark the Ambulance as Busy
        await pool.query('UPDATE Ambulances SET status = "Busy" WHERE ambulance_id = ?', [ambulance_id]);

        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        console.error("Booking Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// --- GET USER BOOKING HISTORY ---
app.get('/api/bookings/user/:id', async (req, res) => {
    const userId = req.params.id;
    
    try {
        // We join with Ambulances to show the vehicle number in the history if needed
        const sql = `
            SELECT 
                b.booking_id, 
                b.destination_hospital, 
                b.status, 
                b.fare, 
                b.created_at,
                a.vehicle_number
            FROM Bookings b
            LEFT JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            WHERE b.user_id = ?
            ORDER BY b.created_at DESC 
            LIMIT 10`;

        const [rows] = await pool.query(sql, [userId]);
        res.json(rows);
    } catch (err) {
        console.error("History Error:", err.message);
        res.status(500).json({ error: "Could not fetch booking history" });
    }
});

app.get('/api/bookings/track/:id', async (req, res) => {
    const bookingId = req.params.id;
    try {
        const sql = `
            SELECT 
                b.status, b.pickup_location, b.destination_hospital,
                d.name AS driver_name, 
                d.phone_number, -- Changed from phone to phone_number
                a.vehicle_number, a.ambulance_type
            FROM Bookings b
            LEFT JOIN Drivers d ON b.driver_id = d.driver_id
            LEFT JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            WHERE b.booking_id = ? 
            AND b.status IN ('Pending', 'Accepted')`;
            
        const [rows] = await pool.query(sql, [bookingId]);
        res.json({ success: rows.length > 0, data: rows[0] || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FIXED INCOMING ROUTE: Check for both 'Pending' (Broadcast) and 'Assigned' (Direct)
app.get('/api/drivers/incoming/:id', async (req, res) => {
    const driverId = req.params.id;
    try {
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

// NEW ROUTE: Fetch individual driver stats
app.get('/api/drivers/stats/:id', async (req, res) => {
    const driverId = req.params.id;
    try {
        // This query calculates earnings and trip counts from the Bookings table
        const sql = `
            SELECT 
                IFNULL(SUM(fare), 0) AS earnings, 
                COUNT(*) AS trips 
            FROM Bookings 
            WHERE driver_id = ? AND status = 'Completed'`;
            
        const [rows] = await pool.query(sql, [driverId]);
        
        // Return JSON so the frontend can update the "Today's Earnings" and "Total Trips" cards
        res.json({
            success: true,
            earnings: rows[0].earnings,
            trips: rows[0].trips
        });
    } catch (err) {
        console.error("Stats Error:", err.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------
// 8. ROUTES: ADMIN MANAGEMENT (FIXED DB CALLS)
// ---------------------------------------------------------
app.get('/api/admin/stats', async (req, res) => {
    try {
        // CHANGED 'db.execute' to 'pool.execute' to prevent crash
        const [revenueRes] = await pool.execute('SELECT SUM(fare) as totalRevenue FROM Bookings');
        const [bookingsRes] = await pool.execute('SELECT COUNT(*) as count FROM Bookings');
        const [orgsRes] = await pool.execute('SELECT COUNT(*) as count FROM Organizations');
        
        let driversCount = 0;
        try {
            const [driversRes] = await pool.execute('SELECT COUNT(*) as count FROM Drivers');
            driversCount = driversRes[0].count;
        } catch (e) { console.log("Drivers table check failed"); }

        res.json({
            success: true,
            revenue: revenueRes[0].totalRevenue || 0,
            bookingsCount: bookingsRes[0].count || 0,
            driversCount: driversCount,
            orgsCount: orgsRes[0].count || 0
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE, POST, and DEBUG routes remain same...
app.post('/api/admin/organizations', async (req, res) => {
    const { name, domain, discount_rate } = req.body; 
    try {
        const sql = `INSERT INTO Organizations (org_name, email_domain, discount_rate) VALUES (?, ?, ?)`;
        const [result] = await pool.query(sql, [name, domain, discount_rate]);
        res.status(201).json({ success: true, id: result.insertId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/admin/organizations/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM Organizations WHERE org_id = ?`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));