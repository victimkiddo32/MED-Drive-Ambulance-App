const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // We'll query directly for now to test

router.get('/closest', async (req, res) => {
    const { userLat, userLng } = req.query;

    try {
        // SQL math to calculate distance and return the top 5
        const query = `
            SELECT *, 
            (6371 * acos(cos(radians(?)) * cos(radians(lat)) * cos(radians(lng) - radians(?)) + sin(radians(?)) * sin(radians(lat)))) AS distance 
            FROM Ambulances 
            WHERE status = 'Available'
            ORDER BY distance ASC 
            LIMIT 5
        `;
        const [rows] = await pool.execute(query, [userLat, userLng, userLat]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Add a new ambulance (Provider Action)
router.post('/add', async (req, res) => {
    const { provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng } = req.body;
    try {
        const query = `INSERT INTO Ambulances 
            (provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Available')`;
        
        await pool.execute(query, [provider_id, model_name, ambulance_type, driver_name, driver_phone, lat, lng]);
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// Update ambulance status (e.g., set to 'Busy')
router.put('/update-status/:id', async (req, res) => {
    try {
        const { id } = req.params; // Gets the ID from the URL
        const { status } = req.body; // Gets the new status from the request body

        const query = 'UPDATE Ambulances SET status = ? WHERE ambulance_id = ?';
        await pool.query(query, [status, id]);

        res.json({ message: `Ambulance ${id} status updated to ${status}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;