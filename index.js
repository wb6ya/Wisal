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
app.use(ejsLayouts);
const server = http.createServer(app);
const io = new Server(server);


// Import Routers
const pagesRouter = require('./src/routes/pages');
const apiRouter = require('./src/routes/api')(io);
const webhookRouter = require('./src/routes/webhook')(io);

// =================================================================
// 4. MIDDLEWARE
// =================================================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                ...helmet.contentSecurityPolicy.getDefaultDirectives(),
                "script-src": ["'self'", "cdn.jsdelivr.net"],
                "img-src": ["'self'", "data:", "res.cloudinary.com"],
                "media-src": ["'self'", "res.cloudinary.com"], // <-- هذا هو السطر الجديد
                "script-src-attr": ["'unsafe-inline'"],
            },
        },
    })
);

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 } // 14 days
});
app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// =================================================================
// 5. SOCKET.IO CONNECTION HANDLING
// =================================================================
io.on('connection', (socket) => {
    const session = socket.request.session;
    if (session && session.companyId) {
        socket.join(session.companyId.toString());
    }
});

// =================================================================
// 6. ROUTE DEFINITIONS
// =================================================================
console.log("Registering page routes..."); // <-- السطر الأول
app.use('/', pagesRouter);

console.log("Registering API routes..."); // <-- السطر الثاني
app.use('/api', apiRouter);

// --- أضف الأوامر التشخيصية هنا ---
console.log("Attempting to register webhook routes..."); // <-- السطر الثالث (قبل)
app.use('/webhook', webhookRouter);
console.log("✅ Webhook routes registered successfully!"); // <-- السطر الرابع (بعد)


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