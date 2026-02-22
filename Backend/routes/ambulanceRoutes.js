const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. GET: Fetch all ambulances (Used by Provider Portal)
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ambulances ORDER BY ambulance_id DESC');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. GET: Find 5 closest available ambulances
router.get('/closest', async (req, res) => {
    const { lat, lng } = req.query; // Ensure these match your frontend fetch call

    try {
        const query = `
            SELECT *, 
            (6371 * acos(cos(radians($1)) * cos(radians(lat)) * cos(radians(lng) - radians($2)) + sin(radians($1)) * sin(radians(lat)))) AS distance 
            FROM ambulances 
            WHERE status = 'Available'
            ORDER BY distance ASC 
            LIMIT 5
        `;
        const result = await pool.query(query, [lat, lng]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. POST: Add a new ambulance (Provider Action)
router.post('/add', async (req, res) => {
    try {
        const {
            provider_id, model_name, ambulance_type,
            driver_name, driver_phone, lat, lng, image_url
        } = req.body;

        if (!provider_id || !model_name || !driver_name) {
            return res.status(400).json({ error: "Missing required fields." });
        }

        // Correct version for TiDB/MySQL syntax
        const query = `
    SELECT *, 
    (6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) AS distance 
    FROM ambulances 
    WHERE status = 'Available'
    ORDER BY distance ASC 
    LIMIT 5
`;
        const [rows] = await pool.execute(query, [lat, lng, lat]); // Use .execute for MySQL/TiDB

        const result = await pool.query(query, [
            provider_id, model_name, ambulance_type,
            driver_name, driver_phone, lat, lng,
            image_url || '../assets/images/logo.png',
            'Available'
        ]);

        res.status(201).json({ message: "Ambulance added!", ambulance: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. PUT: Update ambulance status (e.g., set to 'Busy')
router.put('/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const query = 'UPDATE ambulances SET status = $1 WHERE ambulance_id = $2 RETURNING *';
        const result = await pool.query(query, [status, id]);

        if (result.rowCount === 0) return res.status(404).json({ error: "Ambulance not found" });

        res.json({ message: "Status updated", ambulance: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. PUT: Update specific fields (The "Auto-Fix" route for image_url)
router.put('/update/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { image_url } = req.body;

        const result = await pool.query(
            'UPDATE ambulances SET image_url = $1 WHERE ambulance_id = $2 RETURNING *',
            [image_url, id]
        );

        res.json({ message: "Ambulance updated", ambulance: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;