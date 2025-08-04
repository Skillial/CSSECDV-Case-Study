const { OccasioDB } = require('./../config/db');
const { hashString } = require('./../config/hash'); // Assuming you have a utility function for hashing passwords

const controller = {

    // Renders the signup page
    page: (req, res) => {
        // Pass flash messages to the template from res.locals, which were set by app.js middleware
        const errorMessages = res.locals.error_messages || [];
        const successMessages = res.locals.success_messages || [];

        res.render("signup", {
            error_messages: errorMessages,   // Use messages from res.locals
            success_messages: successMessages // Use messages from res.locals
        });
    },


    // Handles user registration
    register: async (req, res) => {
        // Destructure username, password, and confirmPassword from the request body
        const { username, password, confirmPassword } = req.body;
        let errors = []; // Array to store validation errors

        // --- Input Validation ---

        // Check if all fields are filled
        // Corrected: Use !confirmPassword to check if it's missing or empty
        if (!username || !password || !confirmPassword) {
            errors.push('Please fill in all fields.');
        }

        // Check if passwords match
        if (password !== confirmPassword) {
            errors.push('Passwords do not match.');
        }

        // Define password regex patterns for complexity requirements
        const passwordRegex = {
            length: /.{8,}/,        // At least 8 characters long
            uppercase: /[A-Z]/,     // At least one uppercase letter
            lowercase: /[a-z]/,     // At least one lowercase letter
            number: /[0-9]/,        // At least one number
            specialChar: /[!@#$%^&*]/ // At least one special character
        };

        // Validate password against defined regex rules
        if (!passwordRegex.length.test(password)) {
            errors.push('Password must be at least 8 characters long.');
        }
        if (!passwordRegex.uppercase.test(password)) {
            errors.push('Password must contain an uppercase letter.');
        }
        if (!passwordRegex.lowercase.test(password)) {
            errors.push('Password must contain a lowercase letter.');
        }
        if (!passwordRegex.number.test(password)) {
            errors.push('Password must contain a number.');
        }
        if (!passwordRegex.specialChar.test(password)) {
            errors.push('Password must contain a special character (!@#$%^&*).');
        }

        // If there are any validation errors, flash them and redirect back to the registration page
        if (errors.length > 0) {
            req.flash('error', errors.join('<br>')); // Join errors for display
            console.log("Validation errors:", errors);  
            return res.redirect('/register');
        }

        // --- Database Operations ---

        try {
            console.log("Registering user:", username);
            // Hash the password before starting the transaction, as hashing is asynchronous
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString(); // Get current time in ISO format

            // Define the transaction operations
            const registerTransaction = OccasioDB.transaction(() => {
                // Check if username already exists within the transaction using a prepared statement
                const stmt = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?');
                const existingUser = stmt.get(username);

                // If a user with the given username already exists, throw an error to roll back the transaction
                if (existingUser) {
                    // Throw a custom error that can be caught and translated into a user-friendly message
                    throw new Error('USERNAME_EXISTS');
                }

                // Prepare the INSERT statement once
                const insertStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                // Execute the prepared INSERT statement
                insertStmt.run(username, hashedPassword, 'customer', 0, null, null, currentTime, currentTime, currentTime);
            });

            // Execute the transaction
            registerTransaction();

            // If transaction is successful, flash a success message and redirect to the login page
            req.flash('success', 'You are now registered and can log in!');
            res.redirect('/login');

        } catch (error) {
            // Catch any errors that occur during database operations or password hashing
            // Check for the specific error thrown by the transaction for existing username
            if (error.message === 'USERNAME_EXISTS') {
                req.flash('error', 'Registration failed. Please try again with different information.'); // Vague error for security
            } else {
                console.error("Registration error:", error.message);
                req.flash('error', 'An unexpected error occurred during registration.');
            }
            res.redirect('/register');
        }
    }
};

module.exports = controller;
