const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./config/db'); // Ensure your DB connection is imported here

const app = express();

// Middleware
app.use(cors()); 
app.use(express.json());

// 4. Feature Routes (REMOVED the direct app.get here)
app.use('/api/ambulances', require('./routes/ambulanceRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));

// 6. Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});