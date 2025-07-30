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
const helmet = require('helmet');
const ejsLayouts = require('express-ejs-layouts');

// =================================================================
// 2. EXPRESS APP & SERVER INITIALIZATION
// =================================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// =================================================================
// 3. CONFIGURATIONS
// =================================================================
// Cloudinary Config
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Session Store
const sessionStore = MongoStore.create({ mongoUrl: process.env.MONGO_URI });

// =================================================================
// 4. MIDDLEWARE
// =================================================================

// --- EJS & Layouts Setup (Order is important!) ---
// Step 1: Set the view engine to EJS.
app.set('view engine', 'ejs');
// Step 2: Specify the directory where the view files are located.
app.set('views', path.join(__dirname, 'src', 'views'));
// Step 3: Enable EJS layouts. This must come AFTER setting the view engine and views.
app.use(ejsLayouts);

// --- Static Files ---
app.use(express.static(path.join(__dirname, 'public')));

// --- Body Parsers (Handle incoming request bodies) ---
// IMPORTANT: The raw body parser for the webhook must come BEFORE the general json parser.
// This is required to verify the X-Hub-Signature-256 from Meta.
app.use('/webhook', express.raw({ type: 'application/json' }));

// Standard JSON and URL-encoded parsers for all other routes.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Security ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "script-src": ["'self'", "https://cdn.jsdelivr.net"],
            "img-src": ["'self'", "data:", "res.cloudinary.com"],
            "media-src": ["'self'", "res.cloudinary.com"],
            // Note: 'unsafe-inline' is needed for Bootstrap's inline event handlers in some components.
            // If you refactor to use event listeners in JS, this can be removed.
            "script-src-attr": ["'unsafe-inline'"],
        },
    },
}));

// --- Session Management ---
const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Set to false for best practice
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
        httpOnly: true,
        maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
    }
});
app.use(sessionMiddleware);

// Share session middleware with Socket.IO
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// =================================================================
// 5. SOCKET.IO CONNECTION HANDLING
// =================================================================
io.on('connection', (socket) => {
    const session = socket.request.session;
    // Join a room based on the company ID to isolate broadcasts
    if (session && session.companyId) {
        socket.join(session.companyId.toString());
    }
});

// =================================================================
// 6. ROUTE DEFINITIONS
// =================================================================
// Import routers after all configurations
const pagesRouter = require('./src/routes/pages');
const apiRouter = require('./src/routes/api')(io);
const webhookRouter = require('./src/routes/webhook')(io);

app.use('/', pagesRouter);
app.use('/api', apiRouter);
app.use('/webhook', webhookRouter);

// =================================================================
// 7. SERVER START
// =================================================================
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('✅ Database connected successfully!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
    })
    .catch(err => console.error("❌ Could not connect to MongoDB:", err));