require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Import Routers
const pagesRouter = require('./src/routes/pages');
const apiRouter = require('./src/routes/api')(io);
const webhookRouter = require('./src/routes/webhook')(io);

// Middleware
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src', 'views'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const sessionMiddleware = session({
    secret: 'your_super_secret_key_123',
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGO_URI }),
    cookie: { maxAge: 14 * 24 * 60 * 60 * 1000 } // 14 days
});
app.use(sessionMiddleware);
io.use((socket, next) => {
    sessionMiddleware(socket.request, {}, next);
});

// Socket.IO Connection Handling
io.on('connection', (socket) => {
    const session = socket.request.session;
    if (session && session.userId) {
        socket.join(session.companyId.toString());
    }
});

// Route Definitions
app.use('/', pagesRouter);
app.use('/api', apiRouter);
app.use('/webhook', webhookRouter);

// Server Start
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('Database connected successfully!');
        const PORT = process.env.PORT || 3000;
        server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
    })
    .catch(err => console.error("Could not connect to MongoDB:", err));