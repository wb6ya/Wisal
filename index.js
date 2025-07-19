// =================================================================
// 1. IMPORTS & INITIAL SETUP
// =================================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cloudinary = require('cloudinary').v2;

// =================================================================
// 2. CONFIGURATIONS
// =================================================================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// =================================================================
// 3. EXPRESS APP & SOCKET.IO INITIALIZATION
// =================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Import Routers from the new structure
const pagesRouter = require('./src/routes/pages');
const apiRouter = require('./src/routes/api')(io); // Pass the io instance to the API router
const webhookRouter = require('./src/routes/webhook')(io); // Pass the io instance to the Webhook router

// =================================================================
// 4. MIDDLEWARE
// =================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    secret: 'your_super_secret_key_for_sessions_12345',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI })
});

app.use(sessionMiddleware);

// Share session middleware with Socket.IO to identify users
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// =================================================================
// 5. SOCKET.IO CONNECTION HANDLING
// =================================================================
io.on('connection', (socket) => {
    const session = socket.request.session;
    if (session && session.companyId) {
        // Each company joins a private room. This ensures that real-time
        // notifications for a company are only sent to its own users.
        socket.join(session.companyId.toString());
        console.log(`Socket ${socket.id} connected and joined room ${session.companyId}`);
    }
});

// =================================================================
// 6. ROUTE DEFINITIONS
// =================================================================
app.use('/', pagesRouter);
app.use('/api', apiRouter);
app.use('/webhook', webhookRouter);

// =================================================================
// 7. SERVER START
// =================================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Database connected successfully!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));