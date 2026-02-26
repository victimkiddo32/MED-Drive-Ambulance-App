const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// 1. REGISTER: With Auto-Subscription & Role Support
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;
        const domain = email.split('@')[1]; // e.g., 'g.bracu.ac.bd'

        // Step A: Check if this domain belongs to an Organization (Subscription Logic)
        const [orgs] = await pool.query('SELECT org_id FROM Organizations WHERE email_domain = ?', [domain]);
        const assignedOrgId = orgs.length > 0 ? orgs[0].org_id : null;

        // Step B: Insert User
        // Note: Using 'full_name' to match our 3NF SQL script
        const query = `
            INSERT INTO Users (full_name, email, password, phone_number, role, org_id) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            name, 
            email, 
            password, 
            role || 'User', 
            assignedOrgId
        ]);

        res.status(201).json({ 
            message: "Registration successful!",
            autoSubscribed: assignedOrgId !== null,
            userId: result.insertId
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Email or Phone already exists." });
    }
});

// 2. LOGIN: With Role-Based Redirection Info
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // We join with Organizations so the user knows their discount rate immediately
        const [rows] = await pool.query(`
            SELECT u.user_id, u.full_name, u.role, u.org_id, o.discount_rate
            FROM Users u
            LEFT JOIN Organizations o ON u.org_id = o.org_id
            WHERE u.email = ? AND u.password = ?
        `, [email, password]);

        if (rows.length > 0) {
            const user = rows[0];
            res.json({ 
                success: true,
                user: {
                    id: user.user_id,
                    name: user.full_name,
                    role: user.role,
                    discount: user.discount_rate || 0
                }
            });
        } else {
            res.status(401).json({ success: false, message: "Invalid email or password" });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;