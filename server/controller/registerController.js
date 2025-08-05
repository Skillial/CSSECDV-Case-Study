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
            // Hash the password before starting the transaction, as hashing is asynchronous
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString(); // Get current time in ISO format

            // Define the transaction operations
            const registerTransaction = OccasioDB.transaction(() => {
                // Insert into accounts table
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at, address, profile_image_blob) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'customer', 0, null, null, currentTime, currentTime, currentTime, null, null);

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
    },

    // Handles new admin registration (now sends JSON response)
    registerAdmin: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        console.log(username, password, confirmPassword);
        let errors = [];

        // --- Input Validation ---
        if (!username || !password || !confirmPassword) {
            errors.push('Please fill in all fields.');
        }

        if (password !== confirmPassword) {
            errors.push('Passwords do not match.');
        }

        const passwordRegex = {
            length: /.{8,}/,
            uppercase: /[A-Z]/,
            lowercase: /[a-z]/,
            number: /[0-9]/,
            specialChar: /[!@#$%^&*]/
        };

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
        try {
            const stmt = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?');
            const existingUser = stmt.get(username);
            if (existingUser) {
                // Changed to a vague error message for security
                errors.push('Admin registration failed. Please try again with different information.');
            }
        } catch (dbError) {
            console.error("Database check for existing admin user error:", dbError.message);
            errors.push('An unexpected database error occurred during admin registration.');
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: errors.join('<br>') }); // Send JSON error
        }

        // --- Proceed with Registration if no errors found so far ---
        try {
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString();

            const registerAdminTransaction = OccasioDB.transaction(() => {
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'admin', 0, null, null, currentTime, currentTime, currentTime);

                const newAccountId = accountInfo.lastInsertRowid;

                const insertPasswordHistoryStmt = OccasioDB.prepare(
                    'INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)'
                );
                insertPasswordHistoryStmt.run(newAccountId, hashedPassword, currentTime);
            });

            registerAdminTransaction();

            // Send JSON success response
            res.status(200).json({ message: `Admin '${username}' registered successfully!` });

        } catch (error) {
            console.error("Admin registration transaction error:", error.message);
            res.status(500).json({ message: 'An unexpected error occurred during admin registration.' }); // Send JSON error
        }
    },

    // Handles new manager registration (now sends JSON response)
    registerManager: async (req, res) => {
        const { username, password, confirmPassword } = req.body;
        let errors = [];

        // --- Input Validation ---
        if (!username || !password || !confirmPassword) {
            errors.push('Please fill in all fields.');
        }

        if (password !== confirmPassword) {
            errors.push('Passwords do not match.');
        }

        const passwordRegex = {
            length: /.{8,}/,
            uppercase: /[A-Z]/,
            lowercase: /[a-z]/,
            number: /[0-9]/,
            specialChar: /[!@#$%^&*]/
        };

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
        try {
            const stmt = OccasioDB.prepare('SELECT id FROM accounts WHERE username = ?');
            const existingUser = stmt.get(username);
            if (existingUser) {
                // Changed to a vague error message for security
                errors.push('Employee registration failed. Please try again with different information.');
            }
        } catch (dbError) {
            console.error("Database check for existing manager user error:", dbError.message);
            errors.push('An unexpected database error occurred during manager registration.');
        }

        if (errors.length > 0) {
            return res.status(400).json({ message: errors.join('<br>') }); // Send JSON error
        }

        // --- Proceed with Registration if no errors found so far ---
        try {
            const hashedPassword = await hashString(password);
            const currentTime = new Date().toISOString();

            const registerManagerTransaction = OccasioDB.transaction(() => {
                const insertAccountStmt = OccasioDB.prepare(
                    'INSERT INTO accounts (username, password_hash, role, login_attempts, lockout_until, last_successful_login, last_login_attempt, last_password_change, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                const accountInfo = insertAccountStmt.run(username, hashedPassword, 'manager', 0, null, null, currentTime, currentTime, currentTime);

                const newAccountId = accountInfo.lastInsertRowid;

                const insertPasswordHistoryStmt = OccasioDB.prepare(
                    'INSERT INTO password_history (account_id, password_hash, created_at) VALUES (?, ?, ?)'
                );
                insertPasswordHistoryStmt.run(newAccountId, hashedPassword, currentTime);
            });

            registerManagerTransaction();

            // Send JSON success response
            res.status(200).json({ message: `Manager '${username}' registered successfully!` });

        } catch (error) {
            console.error("Manager registration transaction error:", error.message);
            res.status(500).json({ message: 'An unexpected error occurred during manager registration.' }); // Send JSON error
        }
    },
    assignEmployee: (req, res) => {
        const { employeeId, assignedCategories } = req.body;

        // Basic validation
        if (!employeeId || !Array.isArray(assignedCategories)) {
            return res.status(400).json({ message: 'Invalid request: employeeId and assignedCategories array are required.' });
        }

        try {
            // Start a database transaction for atomicity
            OccasioDB.transaction(() => {
                // 1. Delete existing assignments for this employee
                const deleteStmt = OccasioDB.prepare('DELETE FROM employee_categories WHERE employee_id = ?');
                deleteStmt.run(employeeId);

                // 2. Insert new assignments for each selected category
                const insertStmt = OccasioDB.prepare(
                    'INSERT INTO employee_categories (employee_id, category_name, created_at) VALUES (?, ?, ?)'
                );
                const currentTime = new Date().toISOString();

                assignedCategories.forEach(category => {
                    insertStmt.run(employeeId, category, currentTime);
                });

            })(); // Immediately invoke the transaction function

            res.status(200).json({ message: 'Employee assignments updated successfully.' });

        } catch (error) {
            console.error('Error updating employee assignments:', error.message);
            // Handle unique constraint errors specifically if a category is somehow duplicated in the input
            if (error.message.includes('UNIQUE constraint failed: employee_categories.employee_id, employee_categories.category_name')) {
                return res.status(409).json({ message: 'Duplicate category assignment detected. Please check your selection.' });
            }
            res.status(500).json({ message: 'An unexpected error occurred while updating assignments.' });
        }
    }

};

module.exports = controller;
