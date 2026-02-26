const express = require('express');
const router = express.Router();
const pool = require('../config/db'); 

// 1. GET: Fetch Ambulances
// UPDATED: Now filters by provider_id if provided (for Provider Portal)
router.get('/', async (req, res) => {
    const { provider_id } = req.query;
    try {
        let query = `
            SELECT 
                a.ambulance_id AS id, 
                a.vehicle_number, 
                a.ambulance_type,
                a.status,
                a.current_location,
                u.full_name AS driver_name, 
                d.is_online,
                p.company_name AS provider
            FROM Ambulances a
            LEFT JOIN Providers p ON a.provider_id = p.provider_id
            LEFT JOIN Drivers d ON a.ambulance_id = d.ambulance_id
            LEFT JOIN Users u ON d.user_id = u.user_id
        `;

        const params = [];
        if (provider_id) {
            query += ` WHERE a.provider_id = ?`;
            params.push(provider_id);
        }

        const [rows] = await pool.execute(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Fetch Error:", err.message);
        res.status(500).json({ error: "Failed to fetch ambulance list." });
    }
});

// 2. GET: Closest 5 (Uber Logic)
// Uses the Haversine formula to find nearby Available ambulances
router.get('/closest', async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) return res.status(400).json({ error: "Location required." });

    try {
        const query = `
            SELECT a.*, p.company_name,
            (6371 * acos(cos(radians(?)) * cos(radians(a.lat)) * cos(radians(a.lng) - radians(?)) + 
            sin(radians(?)) * sin(radians(a.lat)))) AS distance 
            FROM Ambulances a
            JOIN Providers p ON a.provider_id = p.provider_id
            WHERE a.status = 'Available'
            ORDER BY distance ASC LIMIT 5
        `;
        const [rows] = await pool.execute(query, [lat, lng, lat]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Distance calculation failed." });
    }
});

// 3. POST: Add new ambulance (Linked to Provider)
router.post('/add', async (req, res) => {
    const { 
        provider_id, 
        vehicle_number, 
        ambulance_type, 
        status,
        lat, 
        lng 
    } = req.body;

    try {
        // First, check if provider exists
        const query = `
            INSERT INTO Ambulances 
            (provider_id, vehicle_number, ambulance_type, status, lat, lng) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        await pool.execute(query, [provider_id, vehicle_number, ambulance_type, status || 'Available', lat || 0, lng || 0]);
        res.status(201).json({ message: "Ambulance added successfully!" });
    } catch (err) {
        console.error("Insert Error:", err.message);
        res.status(500).json({ error: "Ensure the Vehicle Number is unique." });
    }
});

module.exports = router;