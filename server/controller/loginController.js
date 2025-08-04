const passport = require('passport');

const controller = {

    // Renders the login page
    page: (req, res) => {
        // Retrieve flash messages from res.locals, which were set by app.js middleware
        const errorMessages = res.locals.error_messages || [];
        const successMessages = res.locals.success_messages || [];

        // Pass only the first error message (if any) to the template
        // Pass all success messages (if any) as they might come from registration success
        res.render("login", {
            error_messages: errorMessages.length > 0 ? [errorMessages[0]] : [],
            success_messages: successMessages
        });
    },

    // Handles user login attempt
    login: (req, res, next) => {
        // Use Passport.js's local strategy for authentication
        passport.authenticate('local', {
            successRedirect: '/home',      // Redirect to home page on successful login
            failureRedirect: '/login',     // Redirect back to login page on failed login
            failureFlash: true             // Enable flash messages for failed authentication attempts
        })(req, res, next); // Call the middleware
    },

    // Handles user logout
    logout: (req, res, next) => {
        req.logout((err) => { // Passport.js logout method
            if (err) {
                return next(err);
            }
            req.flash('success', 'You are logged out.'); // Optional: Flash a logout success message
            res.redirect('/login'); // Redirect to login page after logout
        });
    }
};

module.exports = controller;
