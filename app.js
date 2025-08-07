require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
const passport = require('passport');
const passportConfig = require('./server/config/passport');
passportConfig(passport); 
const flash = require('express-flash');
const session = require('express-session');

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' })); 

app.set("view engine", "ejs"); 

app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false, 
    saveUninitialized: false, 
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

app.use(flash());

app.use(passport.initialize()); 
app.use(passport.session());   

app.use((req, res, next) => {
    res.locals.success_messages = req.flash('success');
    res.locals.error_messages = req.flash('error');
    res.locals.user = req.user || null; 
    next();
});

const loginRoute = require('./server/router/loginRouter');
app.use('/', loginRoute);

const registerRoute = require('./server/router/registerRouter');
app.use('/', registerRoute);

const homeRoute = require('./server/router/homeRouter');
app.use('/', homeRoute);

const profileRoute = require('./server/router/profileRouter');
app.use('/', profileRoute);

const manageRoute = require('./server/router/manageRouter');
app.use('/', manageRoute);

const orderRoute = require('./server/router/orderRouter');
app.use('/', orderRoute);

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/error', (req, res) => {
    res.render('error');
});

app.use((req, res, next) => {
    res.status(404).render('error', { message: 'Page Not Found', statusCode: 404 });
});


const PORT = process.env.PORT || 3000; 
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log(`Server running on http://localhost:${PORT}`);
});
