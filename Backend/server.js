const express = require('express');
const cors = require('cors'); // Keep this one at the top
require('dotenv').config();

const app = express();

// Middleware
app.use(cors()); // This is the line that actually enables the "bridge"
app.use(express.json());

// 3. Simple Test Route
app.get('/', (req, res) => {
    res.send('Ambulance Service API is running! 🚑');
});

// 4. Feature Routes
app.use('/api/ambulances', require('./routes/ambulanceRoutes'));
app.use('/api/bookings', require('./routes/bookingRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/reviews', require('./routes/reviewRoutes'));

// 6. Start Server
const PORT = process.env.PORT || 5000;

console.log("DB_USER check:", process.env.DB_USER);
console.log("DB_PASS length:", process.env.DB_PASSWORD ? process.env.DB_PASSWORD.length : "EMPTY");

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});

