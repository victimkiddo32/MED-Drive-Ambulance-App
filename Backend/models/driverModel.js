const pool = require('../config/db');

const Driver = {
    // Get all drivers from the database
    getAll: async () => {
        const [rows] = await pool.query('SELECT * FROM Drivers');
        return rows;
    },

    // Find one driver by their ID
    getById: async (id) => {
        const [rows] = await pool.query('SELECT * FROM Drivers WHERE driver_id = ?', [id]);
        return rows[0];
    }
};

module.exports = Driver;