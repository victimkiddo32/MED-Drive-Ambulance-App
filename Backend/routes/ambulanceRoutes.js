const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // Ensure this uses mysql2

// GET: Fetch all ambulances
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
    SELECT 
                a.ambulance_id AS id, 
                a.ambulance_type,
                a.status,
                a.image_url,
                d.driver_name, 
                d.phone_number AS contact,
                d.rating AS driver_rating,
                h.hospital_name AS provider,
                h.provider_type
            FROM Ambulances a
            LEFT JOIN Drivers d ON a.driver_id = d.driver_id
            LEFT JOIN Hospitals h ON a.hospital_id = h.hospital_id
`);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: Find 5 closest available ambulances (MySQL/TiDB Syntax)
router.get('/closest', async (req, res) => {
    const { lat, lng } = req.query;
    try {
        const query = `
            SELECT *, 
            (6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) AS distance 
            FROM ambulances 
            WHERE status = 'Available'
            ORDER BY distance ASC 
            LIMIT 5
        `;
        const [rows] = await pool.execute(query, [lat, lng, lat]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add new ambulance
router.post('/add', async (req, res) => {
    const { provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng, image_url } = req.body;
    try {
        const query = `INSERT INTO ambulances (provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng, image_url, status) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await pool.execute(query, [provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng, image_url, 'Available']);
        res.status(201).json({ message: "Ambulance added successfully!" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;