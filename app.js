require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const passport = require('passport');
const passportConfig = require('./server/config/passport');
passportConfig(passport); // Initialize Passport configuration
const flash = require('express-flash');
const session = require('express-session');


// --- Middleware Setup ---

// Serve static files (e.g., CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Body parser for form data and JSON
// IMPORTANT: Increase the limit to handle larger payloads like image BLOBs.
// This must be configured *before* any routes that might receive large bodies.
app.use(express.json({ limit: '50mb' })); // Increased limit to 50MB
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increased limit to 50MB

// Set up your view engine (assuming EJS)
app.set("view engine", "ejs"); // This is a setting, not middleware, so its position is flexible

// Express Session Middleware - MUST come before flash and passport session
app.use(session({
    secret: process.env.SESSION_SECRET, // Use a strong, random string from your .env
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    cookie: { maxAge: 1000 * 60 * 60 * 24 } // Optional: Session expires after 1 day
}));

// Connect Flash Middleware - MUST come after session
app.use(flash());

// Passport.js Middleware - MUST come after session and flash
app.use(passport.initialize()); // Initializes Passport
app.use(passport.session());    // Enables Passport session support (uses express-session)

// Make flash messages and user object available to all templates (optional, but good practice)
app.use((req, res, next) => {
    res.locals.success_messages = req.flash('success');
    res.locals.error_messages = req.flash('error');
    res.locals.user = req.user || null; // Make authenticated user available
    next();
});


// --- Routes ---

// Import your route modules
const loginRoute = require('./server/router/loginRouter');
app.use('/', loginRoute);

const registerRoute = require('./server/router/registerRouter');
app.use('/', registerRoute);

const homeRoute = require('./server/router/homeRouter');
app.use('/', homeRoute);

const profileRoute = require('./server/router/profileRouter');
app.use('/', profileRoute); // This will now handle /profile and the new image routes

// Default route (redirect to login)
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Removed: app.get('/profile', ...) as it's handled by profileRoute
// Removed: app.get('/ordersinventory', ...) as requested
// Removed: app.get('/dashboard', ...) as requested

// Keep other specific routes if they are not part of a dedicated router
app.get('/product', (req, res) => {
    res.render('product');
});

app.get('/error', (req, res) => {
    res.render('error');
});

app.get('/ordersinventory', (req, res) => {
    res.render('ordersinventory');
});


// --- Start Server ---
const PORT = process.env.PORT || 3000; // Use environment variable or default to 3000
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log(`Server running on http://localhost:${PORT}`);
});
