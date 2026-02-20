const db = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Register User
exports.registerUser = async (req, res) => {
    const { name, email, password, phone_number } = req.body;
    try {
        // 1. Check if user already exists
        const [existingUser] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (existingUser.length > 0) return res.status(400).json({ message: "User already exists" });

        // 2. Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Insert into TiDB
        await db.query(
            'INSERT INTO Users (name, email, password, phone_number) VALUES (?, ?, ?, ?)',
            [name, email, hashedPassword, phone_number]
        );

        res.status(201).json({ message: "User registered successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

// Login User
exports.loginUser = async (req, res) => {
    const { email, password } = req.body;
    try {
        // 1. Find user by email
        const [users] = await db.query('SELECT * FROM Users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(400).json({ message: "Invalid Credentials" });

        const user = users[0];

        // 2. Compare passwords
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });

        // 3. Create and return JWT
        const token = jwt.sign({ id: user.user_id }, process.env.JWT_SECRET, { expiresIn: '1d' });
        
        res.json({
            token,
            user: { id: user.user_id, name: user.name, email: user.email }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};