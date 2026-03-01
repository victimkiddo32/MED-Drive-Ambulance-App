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


app.post('/api/register', async (req, res) => {
    const { full_name, email, password, phone_number, role } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Create the User Account (Login credentials)
        const [userResult] = await connection.query(
            "INSERT INTO Users (full_name, email, password, phone_number, role) VALUES (?, ?, ?, ?, ?)",
            [full_name, email, password, phone_number, role]
        );

        const newUserId = userResult.insertId;

        // 2. Link to the Pre-existing Driver Slot
        if (role === 'Driver') {
            /* Instead of INSERT, we UPDATE your existing 30001-30005 records.
               We match based on the phone number or name to find which 
               of the 5 slots belongs to this user.
            */
            const [updateResult] = await connection.query(
                `UPDATE Drivers 
                 SET user_id = ?, 
                     status = 'Active' 
                 WHERE phone_number = ? OR name = ?`,
                [newUserId, phone_number, full_name]
            );

            // Safety check: If the name/phone didn't match any of your 5 slots
            if (updateResult.affectedRows === 0) {
                throw new Error("No pre-configured driver slot found for this name/phone.");
            }

            console.log(`User ${newUserId} successfully linked to Driver slot.`);
        }

        await connection.commit();
        res.json({ success: true, message: "Registration successful and driver slot linked!" });

    } catch (err) {
        await connection.rollback();
        console.error("Registration Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        connection.release();
    }
});


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
                a.ambulance_id AS id, 
                a.vehicle_number, 
                a.ambulance_type, 
                a.status, 
                a.image_url, 
                d.name AS driver_name, 
                d.rating AS driver_rating, 
                p.company_name AS provider
            FROM Ambulances a
            /* KEY CHANGE: Join using user_id because your driver_id is now 3, 4, 5... */
            LEFT JOIN Drivers d ON a.driver_id = d.user_id
            LEFT JOIN Providers p ON a.provider_id = p.provider_id`;

        const [results] = await pool.query(sql);
        res.json(results);
    } catch (err) {
        console.error("Fleet Fetch Error:", err);
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

    // Optional: Quick validation
    if (!ambulance_id || ambulance_id === 'undefined') {
        return res.status(400).json({ success: false, error: "No ambulance selected." });
    }

    try {
        const sql = `INSERT INTO Bookings 
            (user_id, ambulance_id, pickup_location, destination_hospital, status, base_fare, fare) 
            VALUES (?, ?, ?, ?, 'Pending', ?, ?)`;

        const [result] = await pool.query(sql, [
            user_id,
            ambulance_id,
            pickup_location,
            destination_hospital,
            base_fare,
            fare
        ]);

        console.log(`✨ New Booking Created: ID ${result.insertId}`);
        res.json({ success: true, bookingId: result.insertId });
    } catch (err) {
        console.error("Booking Creation Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/drivers/incoming/:userId', async (req, res) => {
    const userId = req.params.userId;
    
    // Log every attempt so you can see it in Render Logs
    console.log(`📡 Heartbeat received for Driver ID: ${userId}`);

    try {
        const sql = `
            SELECT b.*, u.full_name AS patient_name
    FROM Bookings b
    JOIN Users u ON b.user_id = u.user_id
    WHERE LOWER(b.status) = 'pending' 
    AND b.driver_user_id = ?  /* 👈 Removed the IS NULL part */
    ORDER BY b.created_at DESC 
    LIMIT 1`;

        const [rows] = await pool.query(sql, [userId]);
        
        console.log(`🔎 DB Search Result: Found ${rows.length} pending bookings.`);

        res.json({ 
            success: true, 
            hasBooking: rows.length > 0, 
            booking: rows[0] || null 
        });
    } catch (err) {
        console.error("❌ SQL Error:", err.message);
        res.status(500).json({ success: false, error: "Database error" });
    }
});

// Ensure this is exactly as written here
app.get('/api/bookings/user/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        const sql = `
            SELECT b.*, a.vehicle_number, a.ambulance_type 
            FROM Bookings b
            LEFT JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            WHERE b.user_id = ? 
            ORDER BY b.created_at DESC`;

        const [rows] = await pool.query(sql, [userId]);
        res.json(rows); // Returns [] if no history, which is correct
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/bookings/accept', async (req, res) => {
    const { booking_id } = req.body; // We only need the booking_id from the frontend

    if (!booking_id) {
        return res.status(400).json({ success: false, error: "Missing Booking ID" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Get the ambulance_id and assigned driver_id from the database
        const [bookingData] = await conn.query(
            "SELECT ambulance_id FROM Bookings WHERE booking_id = ?",
            [booking_id]
        );

        if (bookingData.length === 0) {
            throw new Error("Booking not found");
        }

        const ambId = bookingData[0].ambulance_id;

        // 2. Look up the Driver's User ID from the Ambulances table
        const [ambData] = await conn.query(
            "SELECT driver_id FROM Ambulances WHERE ambulance_id = ?",
            [ambId]
        );

        const driverUserId = ambData[0].driver_id; // This will be 3, 4, or 5

        // 3. Update Booking: Assign the driver and change status
        await conn.query(
            "UPDATE Bookings SET status = 'Accepted', driver_user_id = ? WHERE booking_id = ?",
            [driverUserId, booking_id]
        );

        // 4. Mark Ambulance as Busy
        await conn.query(
            "UPDATE Ambulances SET status = 'Busy' WHERE ambulance_id = ?",
            [ambId]
        );

        // 5. Mark Driver as Busy in the Drivers table
        await conn.query(
            "UPDATE Drivers SET status = 'Busy' WHERE user_id = ?",
            [driverUserId]
        );

        await conn.commit();
        console.log(`✅ Success: Booking ${booking_id} accepted by Driver User ${driverUserId}`);
        res.json({ success: true, message: "Trip accepted successfully." });

    } catch (err) {
        await conn.rollback();
        console.error("❌ Accept Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/bookings/complete', async (req, res) => {
    const { booking_id } = req.body; // Only need booking_id from frontend

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Get the IDs from the database before completing
        const [data] = await conn.query(
            "SELECT ambulance_id, driver_user_id FROM Bookings WHERE booking_id = ?",
            [booking_id]
        );

        if (data.length > 0) {
            const { ambulance_id, driver_user_id } = data[0];

            await conn.query("UPDATE Bookings SET status = 'Completed' WHERE booking_id = ?", [booking_id]);
            await conn.query("UPDATE Ambulances SET status = 'Available' WHERE ambulance_id = ?", [ambulance_id]);
            await conn.query("UPDATE Drivers SET status = 'Available' WHERE user_id = ?", [driver_user_id]);
        }
        else {
            throw new Error("Could not find booking details to complete the trip.");
        }

        await conn.commit();
        res.json({ success: true, message: "Ride completed successfully!" });
    } catch (err) {
        await conn.rollback();
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

// 6. Get Ambulance by Driver's User ID
app.get('/api/ambulances/driver/:userId', async (req, res) => {
    try {
        // Since driver_id in Ambulances is now the User ID (3, 4, 5...)
        const sql = `SELECT * FROM Ambulances WHERE driver_id = ?`;

        const [rows] = await pool.query(sql, [req.params.userId]);
        res.json({ success: true, ambulance: rows[0] || null });
    } catch (err) {
        console.error("Ambulance Fetch Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 7. DRIVER STATS 
app.get('/api/drivers/stats/:userId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT 
                SUM(fare) as earnings, 
                COUNT(*) as total_trips 
             FROM Bookings 
             WHERE driver_user_id = ? AND status = 'Completed'`, 
            [req.params.userId]
        );
        
        res.json({
            success: true,
            earnings: rows[0].earnings || 0,
            total_trips: rows[0].total_trips || 0
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/drivers/incoming/:userId', async (req, res) => {
    // FORCE A SUCCESSFUL TEST
    return res.json({ 
        success: true, 
        hasBooking: true, 
        booking: {
            booking_id: 70020,
            pickup_location: "TEST: Maijdee court",
            destination_hospital: "TEST: Modern Hospital",
            fare: "724.00"
        } 
    });
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


app.get('/api/admin/stats', async (req, res) => {
    try {
        // Updated to use your 'bookings' table and correct field names
        const statsQuery = `
            SELECT 
                COUNT(*) AS total_bookings,
                COALESCE(SUM(fare), 0) AS total_revenue
            FROM bookings 
            WHERE status = 'Completed' OR status = 'completed'
        `;

        const [statsRows] = await pool.query(statsQuery);

        // Math for the 5% platform fee
        const grossRevenue = parseFloat(statsRows[0].total_revenue);
        const systemCommission = (grossRevenue * 0.05).toFixed(2);

        // Standard counts for the other dashboard cards
        const [driverRows] = await pool.query("SELECT COUNT(*) AS count FROM users WHERE role = 'driver'");
        const [userRows] = await pool.query("SELECT COUNT(*) AS count FROM users");

        res.json({
            success: true,
            totalRevenue: grossRevenue,
            systemCommission: systemCommission, // This goes to your new dashboard card
            totalAmbulances: statsRows[0].total_bookings,
            activeTrips: driverRows[0].count,
            totalUsers: userRows[0].count
        });
    } catch (err) {
        console.error("ADMIN STATS ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/organizations', async (req, res) => {
    try {
        // Fetching with the exact column names from your screenshot
        const [orgs] = await pool.query(`
            SELECT org_id, org_name, email_domain, discount_rate 
            FROM Organizations 
            ORDER BY org_id ASC
        `);

        res.json({
            success: true,
            organizations: orgs
        });
    } catch (err) {
        console.error("Org Load Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/users', async (req, res) => {
    try {
        const query = `
            SELECT 
                user_id, 
                full_name, 
                email, 
                phone_number, 
                role 
            FROM users
        `;
        const [rows] = await pool.query(query);
        res.json({ success: true, users: rows });
    } catch (err) {
        console.error("User Route Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all providers with ride counts and earnings
// 1. Service Providers List (For the new Sidebar Section)
app.get('/api/admin/providers', async (req, res) => {
    try {
        const query = `
            SELECT 
                p.company_name, 
                u.full_name AS owner_name,
                u.phone_number,
                COUNT(b.booking_id) AS ride_count,
                COALESCE(SUM(b.fare), 0) AS total_earned
            FROM providers p
            JOIN users u ON p.user_id = u.user_id
            LEFT JOIN bookings b ON b.user_id = u.user_id AND b.status = 'completed'
            GROUP BY p.provider_id, u.user_id, u.full_name, u.phone_number
        `;
        const [rows] = await pool.query(query);
        res.json({ success: true, providers: rows });
    } catch (err) {
        // This will log the specific error to Render console if it fails again
        console.error("PROVIDERS FETCH ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.get('/api/admin/ambulances', async (req, res) => {
    try {
        const query = `
            SELECT 
                a.ambulance_type, 
                a.vehicle_number, 
                a.status,
                u.full_name AS driver_name
            FROM ambulances a
            LEFT JOIN users u ON a.driver_id = u.user_id
        `;
        const [rows] = await pool.query(query);
        res.json({ success: true, ambulances: rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. Static Files & Catch-all (Put these LAST)
app.use(express.static('public'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));