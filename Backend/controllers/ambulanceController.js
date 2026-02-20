const db = require('../config/db');

exports.getAvailableAmbulances = async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM Ambulances WHERE status = "available"');
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};