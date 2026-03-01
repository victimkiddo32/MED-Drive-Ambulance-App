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

app.get('/api/drivers/incoming/:userId', async (req, res) => {
    const userId = req.params.userId; 
    try {
        const sql = `
            SELECT 
                b.booking_id, 
                b.pickup_location, 
                b.destination_hospital AS destination, 
                b.fare, 
                b.ambulance_id,
                b.user_id AS patient_id, 
                u.full_name AS patient_name,
                u.phone_number AS patient_phone
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Users u ON b.user_id = u.user_id
            WHERE a.driver_id = (
                SELECT driver_id FROM Drivers WHERE user_id = ?
            )
            AND b.status = 'Pending'
            ORDER BY b.created_at DESC 
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [userId]);
        
        // Return structured data that matches your frontend expectations
        res.json({ 
            success: true, 
            hasBooking: rows.length > 0, 
            booking: rows[0] || null 
        });
    } catch (err) {
        console.error("Fetch Incoming Error:", err);
        res.status(500).json({ success: false, error: err.message });
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

aapp.post('/api/bookings/accept', async (req, res) => {
    // 1. Destructure all possible names from the frontend
    // Note: We expect the driver's User ID (3) to come in via 'driver_user_id' or 'userId'
    const { booking_id, bookingId, ambulance_id, driver_user_id, userId} = req.body;
    const finalBookingId = booking_id || bookingId;
    
    // The driver's User ID (the number 3 from your data)
    const finalDriverUserId = driver_user_id || userId;

    if (!finalBookingId) {
        return res.status(400).json({ success: false, error: "Missing booking_id" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 2. Update the Booking: Set status to 'Accepted' and store the User ID
        // We use COALESCE to prioritize the ID passed from the frontend
        await conn.query(
            `UPDATE Bookings 
             SET status = 'Accepted', 
                 driver_user_id = COALESCE(?, (SELECT user_id FROM Drivers WHERE driver_id = ?)) 
             WHERE booking_id = ?`, 
            [finalDriverUserId || null, finalDriverUserId || null, finalBookingId]
        );

        // 3. Update the Ambulance: Mark as 'Busy'
        // We use the ambulance_id passed (30001) or find it via the booking record
        await conn.query(
            `UPDATE Ambulances 
             SET status = 'Busy' 
             WHERE ambulance_id = COALESCE(?, (SELECT ambulance_id FROM Bookings WHERE booking_id = ?))`,
            [ambulance_id || null, finalBookingId]
        );

        // 4. Update the Driver status to 'Busy'
        // This ensures the driver is also marked busy in the Drivers table
        await conn.query(
            `UPDATE Drivers 
             SET status = 'Busy' 
             WHERE user_id = ? OR driver_id = ?`,
            [finalDriverUserId || null, finalDriverUserId || null]
        );

        await conn.commit();
        console.log(`✅ Success! Booking ${finalBookingId} accepted by User ${finalDriverUserId}.`);
        
        res.json({ success: true, message: "Booking accepted and statuses updated." });

    } catch (err) {
        await conn.rollback();
        console.error("❌ Accept Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        conn.release();
    }
});

app.post('/api/bookings/complete', async (req, res) => {
    // 1. Updated destructuring to use driver_user_id
    const { booking_id, ambulance_id, driver_user_id } = req.body;
    
    console.log(`Completing Trip: Booking ${booking_id}, Amb ${ambulance_id}, User ${driver_user_id}`);

    if (!booking_id || !ambulance_id) {
        return res.status(400).json({ success: false, error: "Missing booking_id or ambulance_id" });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 2. Update Booking Status
        await conn.query(
            "UPDATE Bookings SET status = 'Completed' WHERE booking_id = ?", 
            [booking_id]
        );

        // 3. Update Ambulance Status back to 'Available'
        // This makes it reappear on the patient's map immediately
        const [ambResult] = await conn.query(
            "UPDATE Ambulances SET status = 'Available' WHERE ambulance_id = ?", 
            [ambulance_id]
        );

        // 4. Update Driver Status back to 'Available' or 'Active'
        // We use user_id because that is the ID we have from the frontend session
        await conn.query(
            "UPDATE Drivers SET status = 'Available' WHERE user_id = ?", 
            [driver_user_id]
        );

        await conn.commit();

        console.log(`✅ Ambulance ${ambulance_id} is now Available.`);

        res.json({ 
            success: true, 
            message: "Ride completed successfully!", 
            ambUpdated: ambResult.affectedRows > 0 
        });
    } catch (err) {
        await conn.rollback();
        console.error("❌ Completion Error:", err);
        res.status(500).json({ success: false, error: err.message });
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
        const sql = `
            SELECT 
                b.booking_id, 
                b.pickup_location, 
                b.destination_hospital, -- Specifically selecting the correct column
                b.fare, 
                b.ambulance_id,
                u.full_name AS patient_name,
                u.phone_number AS patient_phone
            FROM Bookings b
            JOIN Ambulances a ON b.ambulance_id = a.ambulance_id
            JOIN Users u ON b.user_id = u.user_id
            WHERE a.driver_id = (
                SELECT driver_id FROM Drivers WHERE user_id = ?
            )
            AND b.status = 'Pending'
            LIMIT 1
        `;

        const [rows] = await pool.query(sql, [userId]);
        res.json({ success: true, hasBooking: rows.length > 0, booking: rows[0] || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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