const express = require('express');
const router = express.Router();
const pool = require('../config/db'); // We'll query directly for now to test

router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Ambulances');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/add', async (req, res) => {
    try {
        const { vehicle_number, ambulance_type, status, current_location, driver_id, hospital_id } = req.body;

        const query = `INSERT INTO Ambulances 
                       (vehicle_number, ambulance_type, status, current_location, driver_id, hospital_id) 
                       VALUES (?, ?, ?, ?, ?, ?)`;

        const [result] = await pool.query(query, [vehicle_number, ambulance_type, status, current_location, driver_id, hospital_id]);
        
        res.status(201).json({ 
            message: "Ambulance added successfully!", 
            id: result.insertId 
        });
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