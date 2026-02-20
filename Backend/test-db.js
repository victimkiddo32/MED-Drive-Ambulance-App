const pool = require('./config/db');

async function testConnection() {
    console.log('--- Attempting to connect to TiDB... ---');
    try {
        const [rows] = await pool.query('SELECT 1 + 1 AS result');
        console.log('✅ Connection Successful!');
        console.log('Result from TiDB:', rows[0].result);
        process.exit(0);
    } catch (err) {
        console.error('❌ Connection Failed!');
        console.error('Error details:', err.message);
        process.exit(1);
    }
}

testConnection();