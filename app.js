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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set("view engine", "ejs")
app.use(flash());
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
}))

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}.`);
    console.log(`Server running on http://localhost:${PORT}`);
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

const loginRoute = require('./server/router/loginRouter')
app.use('/', loginRoute);

const signUpRoute = require('./server/router/signUpRouter')
app.use('/', signUpRoute);

// Temporary routes for testing
app.get('/home', (req, res) => {
    res.render('home');
});

app.get('/product', (req, res) => {
    res.render('product');
});

app.get('/profile', (req, res) => {
    res.render('profile');
});
