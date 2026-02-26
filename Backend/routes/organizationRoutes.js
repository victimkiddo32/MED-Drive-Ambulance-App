const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// GET all active organizations/subscriptions
router.get('/', async (req, res) => {
    try {
        const [rows] = await pool.query('SELECT * FROM Organizations');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: Add a new corporate partner (Admin only logic)
router.post('/add', async (req, res) => {
    const { org_name, email_domain, discount_rate } = req.body;
    try {
        await pool.query(
            'INSERT INTO Organizations (org_name, email_domain, discount_rate) VALUES (?, ?, ?)',
            [org_name, email_domain, discount_rate]
        );
        res.status(201).json({ message: "Organization added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Domain already exists or database error." });
    }
});

module.exports = router;