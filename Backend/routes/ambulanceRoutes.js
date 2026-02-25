const express = require('express');
const router = express.Router();
const pool = require('../config/db'); 

// 1. GET: Fetch all ambulances (Main Dashboard Table)
// This links the vehicle to the driver and hospital name
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT 
                a.ambulance_id AS id, 
                a.vehicle_number, 
                a.ambulance_type,
                a.status,
                a.image_url,
                a.lat,
                a.lng,
                d.driver_name, 
                d.phone_number AS contact,
                d.rating AS driver_rating,
                h.hospital_name AS provider,
                h.address AS hospital_address
            FROM Ambulances a
            LEFT JOIN Drivers d ON a.driver_id = d.driver_id
            LEFT JOIN Hospitals h ON a.hospital_id = h.hospital_id
        `);
        res.json(rows);
    } catch (err) {
        console.error("Fetch Error:", err.message);
        res.status(500).json({ error: "Failed to fetch ambulance list." });
    }
});

// 2. GET: Find 5 closest available ambulances (The "Uber" Logic)
// Optimized to include Hospital info so users know where the ambulance is coming from
router.get('/closest', async (req, res) => {
    const { lat, lng } = req.query;

    if (!lat || !lng) {
        return res.status(400).json({ error: "Latitude and Longitude are required to find nearby ambulances." });
    }

    try {
        const query = `
            SELECT 
                a.*, 
                h.hospital_name,
                (6371 * acos(cos(radians(?)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(?)) + 
                sin(radians(?)) * sin(radians(a.lat)))) AS distance 
            FROM Ambulances a
            JOIN Hospitals h ON a.hospital_id = h.hospital_id
            WHERE a.status = 'Available'
            ORDER BY distance ASC 
            LIMIT 5
        `;
        const [rows] = await pool.execute(query, [lat, lng, lat]);
        res.json(rows);
    } catch (err) {
        console.error("Distance Error:", err.message);
        res.status(500).json({ error: "Error calculating nearby ambulances." });
    }
});

// 3. GET: Availability Stats (Calls the View we created)
// Perfect for the charts on your Vercel Dashboard
// In routes/ambulanceRoutes.js
router.get('/', async (req, res) => { // This '/' makes the full URL /api/ambulances
    try {
        const [rows] = await pool.execute('SELECT * FROM Ambulances');
        res.json(rows); // This MUST be valid JSON
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. POST: Add new ambulance
router.post('/add', async (req, res) => {
    const { 
        hospital_id, 
        vehicle_number, 
        ambulance_type, 
        driver_id, 
        lat, 
        lng, 
        image_url 
    } = req.body;

    try {
        const query = `
            INSERT INTO Ambulances 
            (hospital_id, vehicle_number, ambulance_type, driver_id, lat, lng, image_url, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')
        `;
        await pool.execute(query, [hospital_id, vehicle_number, ambulance_type, driver_id, lat, lng, image_url]);
        res.status(201).json({ message: "Ambulance added to fleet successfully!" });
    } catch (err) {
        console.error("Insert Error:", err.message);
        res.status(500).json({ error: "Database error while adding ambulance." });
    }
});

module.exports = router;