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
        // IMPORTANT: Ensure the column names here match your DB (ambulance_id, etc.)
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
        console.error("Database Error:", err.message);
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


// --- USER REGISTRATION ROUTE ---
// --- UPDATED REGISTRATION ROUTE ---
app.post('/api/users/register', async (req, res) => {
    // Destructure using the names sent from the frontend
    const { full_name, email, password, phone_number, role } = req.body;

    try {
        // 1. Insert into Users table using exact database column names
        const [result] = await pool.query(
            'INSERT INTO Users (full_name, email, password, phone_number, role) VALUES (?, ?, ?, ?, ?)',
            [full_name, email, password, phone_number, role]
        );

        // In your schema, the primary key is user_id
        const newUserId = result.insertId;

        // 2. Role-specific logic (Optional but recommended)
        if (role === 'Driver') {
            await pool.query(
                'INSERT INTO Drivers (driver_id, name, status) VALUES (?, ?, "Inactive")',
                [newUserId, full_name]
            );
        }

        res.status(201).json({ 
            success: true, 
            message: "User registered successfully", 
            userId: newUserId 
        });

    } catch (err) {
        console.error("Registration Error:", err);
        // Specifically check for duplicate email/phone errors
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: "Email or Phone Number already registered." });
        }
        res.status(500).json({ error: "Database error: " + err.message });
    }
});

// ---------------------------------------------------------
// 5. ROUTES: BOOKINGS (With Atomic Transaction)
// ---------------------------------------------------------
app.post('/api/bookings', async (req, res) => {
    // We now use 'fare' to represent the total/final amount
    const { user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare } = req.body;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // Updated INSERT statement: removed final_fare, using 'fare' instead
        const bookingSql = `
            INSERT INTO Bookings (user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare, status) 
            VALUES (?, ?, ?, ?, ?, ?, 'Pending')`;
            
        const [result] = await conn.query(bookingSql, [user_id, ambulance_id, pickup_location, destination_hospital, base_fare, fare]);

        // Update Ambulance Status to Busy
        await conn.query(`UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?`, [ambulance_id]);

        await conn.commit();
        res.json({ success: true, booking_id: result.insertId });
    } catch (err) {
        await conn.rollback();
        console.error("Booking Error:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/bookings/accept', async (req, res) => {
    const { booking_id, ambulance_id, driver_id } = req.body;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Set the Booking to Accepted
        await conn.query('UPDATE Bookings SET status = "Accepted" WHERE booking_id = ?', [booking_id]);

        // 2. Set the Ambulance to Busy (Matches your Ambulance table)
        await conn.query('UPDATE Ambulances SET status = "Busy" WHERE ambulance_id = ?', [ambulance_id]);

        // 3. Set the Driver to Busy (Matches your Drivers table)
        await conn.query('UPDATE Drivers SET status = "Busy" WHERE driver_id = ?', [driver_id]);

        await conn.commit();
        res.json({ success: true, message: "Trip started. Both Ambulance and Driver are now Busy." });
    } catch (err) {
        await conn.rollback();
        console.error("Accept Trip Error:", err);
        res.status(500).json({ error: "Failed to update status sync." });
    } finally {
        conn.release();
    }
});



app.post('/api/bookings/complete', async (req, res) => {
    const { booking_id, ambulance_id, driver_id } = req.body;
    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        // 1. Mark Booking as Completed
        await conn.query('UPDATE Bookings SET status = "Completed" WHERE booking_id = ?', [booking_id]);

        // 2. Make Ambulance Available again
        await conn.query('UPDATE Ambulances SET status = "Available" WHERE ambulance_id = ?', [ambulance_id]);

        // 3. Make Driver Active again
        await conn.query('UPDATE Drivers SET status = "Active" WHERE driver_id = ?', [driver_id]);

        await conn.commit();
        res.json({ success: true, message: "Trip finished. You are now available for new calls!" });
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



app.get('/api/drivers/notifications/:driverId', async (req, res) => {
    const { driverId } = req.params;
    try {
        const sql = `
            SELECT b.*, u.name as user_name, a.vehicle_number 
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Users u ON b.user_id = u.user_id
            WHERE a.driver_id = ? AND b.status = 'Pending'
            LIMIT 1`;
            
        const [rows] = await pool.query(sql, [driverId]);
        res.json(rows[0] || { message: "No pending rides" });
    } catch (err) {
        res.status(500).json({ error: err.message });
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
        // 1. Get Revenue (Using 'fare' from your verified Bookings table)
        const [revenueRes] = await db.execute('SELECT SUM(fare) as totalRevenue FROM Bookings');
        const totalRevenue = revenueRes[0].totalRevenue || 0;

        // 2. Get Bookings Count
        const [bookingsRes] = await db.execute('SELECT COUNT(*) as count FROM Bookings');
        const bookingsCount = bookingsRes[0].count || 0;

        // 3. Get Organizations Count
        const [orgsRes] = await db.execute('SELECT COUNT(*) as count FROM Organizations');
        const orgsCount = orgsRes[0].count || 0;

        // 4. Get Drivers Count (Wrapped in its own try/catch to prevent 500 if table is missing)
        let driversCount = 0;
        try {
            const [driversRes] = await db.execute('SELECT COUNT(*) as count FROM Drivers');
            driversCount = driversRes[0].count || 0;
        } catch (driverErr) {
            console.error("DRIVERS TABLE ERROR (Setting to 0):", driverErr.message);
        }

        // Send the successful response
        res.status(200).json({
            success: true,
            revenue: totalRevenue,
            bookingsCount: bookingsCount,
            driversCount: driversCount,
            orgsCount: orgsCount
        });

    } catch (error) {
        // This is the "Critical Error" log Google mentioned
        console.error('--- CRITICAL STATS ERROR ---');
        console.error(error.message);
        
        res.status(500).json({ 
            success: false, 
            message: 'Internal Server Error',
            error: error.message 
        });
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