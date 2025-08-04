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

        // --- Database Operations (Username Existence Check) ---
        // Perform this check early so it can contribute to the 'errors' array
        try {
            const stmt = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?');
            const existingUser = stmt.get(username);
            if (existingUser) {
                errors.push('Registration failed. Please try again with different information.'); // Vague error for security
            }
        } catch (dbError) {
            console.error("Database check for existing user error:", dbError.message);
            errors.push('An unexpected database error occurred during registration.');
        }

        // If there are any validation or existence errors, flash only the first one and redirect
        if (errors.length > 0) {
            req.flash('error', errors[0]); // Flash only the first error message
            return res.redirect('/register');
        }

        // --- Proceed with Registration if no errors found so far ---
        try {
            console.log("Registering user:", username);
            // Hash the password before starting the transaction, as hashing is asynchronous
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString(); // Get current time in ISO format

            // Define the transaction operations
            const registerTransaction = OccasioDB.transaction(() => {
                // Insert into accounts table
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'customer', 0, null, null, currentTime, currentTime, currentTime);

                // Get the ID of the newly inserted account
                const newAccountId = accountInfo.lastInsertRowid;

                // Insert into password_history table
                const insertPasswordHistoryStmt = OccasioDB.prepare(
                    'INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)'
                );
                insertPasswordHistoryStmt.run(newAccountId, hashedPassword, currentTime);
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
                console.error("Registration transaction error:", error.message);
                req.flash('error', 'An unexpected error occurred during registration.');
            }
            res.redirect('/register');
        }
    }
};

module.exports = controller;
