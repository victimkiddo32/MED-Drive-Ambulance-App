const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // Ensure 'DB_PASSWORD' matches the key in Render
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 4000,
  ssl: {
    rejectUnauthorized: false // This is required for TiDB Cloud
  }
});

module.exports = pool;