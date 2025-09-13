require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { connectDB } = require('./config/db');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

// Initialize Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: function (origin, callback) {
            // Allow any origin for development (you can restrict this for production)
            callback(null, true);
        },
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// Middleware

// Configure Helmet: allow popups (needed for Firebase auth) and disable COEP for dev
app.use(helmet({
    crossOriginOpenerPolicy: {
        policy: 'same-origin-allow-popups' // This allows Google auth popups
    },
    contentSecurityPolicy: false // Temporarily disable CSP for development
}));
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:5175'
        ];
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach socket.io instance to each request for controllers to emit events
app.use((req, res, next) => {
    req.io = io;
    next();
});

// Import routes
const authRoutes = require('./routes/auth.routes');
const issueRoutes = require('./routes/issue.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const notificationRoutes = require('./routes/notification.routes');
const alertRoutes = require('./routes/alert.routes');

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/issues', issueRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/alerts', alertRoutes);

// Root route
app.get('/', (req, res) => {
    res.json({ message: 'Welcome to Civic Pulse API' });
});

// Socket.io connection
io.on('connection', (socket) => {
    console.log('New client connected');

    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });

    // Handle live updates for issues
    socket.on('newIssue', (data) => {
        io.emit('issueUpdate', data);
    });

    socket.on('statusChange', (data) => {
        io.emit('issueUpdate', data);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Server error'
    });
});

// Health endpoint (DB status + time)
app.get('/api/health', (req, res) => {
    const stateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    res.json({
        status: 'ok',
        dbState: stateMap[mongoose.connection.readyState] || 'unknown',
        time: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0'; // Listen on all network interfaces
connectDB().then(() => {
    server.listen(PORT, HOST, () => {
        console.log(`Server running on http://${HOST}:${PORT}`);
        console.log(`Server accessible on local network`);
    });
});

module.exports = { app, io };
