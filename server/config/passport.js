const LocalStrategy = require('passport-local').Strategy;
const bcrypt = require('bcrypt');
const { OccasioDB } = require('./db'); // Adjust the path as necessary, assuming db.js exports { OccasioDB }

module.exports = function (passport) {

    // Prepared statements for common queries (defined once for efficiency)
    const getAccountByUsernameStmt = OccasioDB.prepare('SELECT * FROM accounts WHERE username = ?');
    const getAccountByIdStmt = OccasioDB.prepare('SELECT * FROM accounts WHERE id = ?');
    const updateLastLoginAttemptStmt = OccasioDB.prepare('UPDATE accounts SET last_login_attempt = ? WHERE username = ?');
    const resetLockoutStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = 0, lockout_until = NULL WHERE id = ?');
    const updateSuccessfulLoginStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = 0, last_successful_login = ?, last_login_attempt = ? WHERE id = ?');
    const updateFailedLoginAttemptStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = ?, last_login_attempt = ? WHERE id = ?');
    const lockAccountStmt = OccasioDB.prepare('UPDATE accounts SET login_attempts = ?, lockout_until = ?, last_login_attempt = ? WHERE id = ?');


    // Helper function to get account by username (synchronous with better-sqlite3)
    // This function will return the row directly or undefined if not found.
    // Errors will be thrown synchronously and caught by the caller's try/catch.
    function getAccountByUsername(username) {
        return getAccountByUsernameStmt.get(username);
    }

    // Helper function to get account by ID (synchronous with better-sqlite3)
    // This function will return the row directly or undefined if not found.
    // Errors will be thrown synchronously and caught by the caller's try/catch.
    function getAccountById(id) {
        return getAccountByIdStmt.get(id);
    }

    // Configure the LocalStrategy for username/password authentication
    passport.use(new LocalStrategy(
        { usernameField: 'username', passReqToCallback: true }, // 'usernameField' matches your schema, 'passReqToCallback' allows access to req
        async (req, username, password, done) => { // Added 'req' parameter
            try {
                const user = getAccountByUsername(username); // Synchronous call

                // --- Vague Error Message & User Not Found Handling ---
                if (!user) {
                    // Update last login attempt for non-existent user (optional, for logging/auditing)
                    // Use prepared statement for run
                    updateLastLoginAttemptStmt.run(new Date().toISOString(), username);
                    return done(null, false, { message: 'Invalid username and/or password' });
                }

                // --- Account Lockout Logic ---
                if (user.lockout_until) {
                    const lockoutTimestamp = new Date(user.lockout_until);
                    const currentTime = new Date();

                    if (lockoutTimestamp > currentTime) {
                        // Account is still locked
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    } else {
                        // Lockout period has expired, reset lockout status
                        // Use prepared statement for run
                        resetLockoutStmt.run(user.id);
                        // Continue to password comparison
                    }
                }

                // --- Password Comparison ---
                const isMatch = await bcrypt.compare(password, user.password_hash); // Use user.password_hash

                if (isMatch) {
                    // Password is correct. Reset login attempts and update last successful login.
                    let lastLoginReportMessage = '';
                    const lastAttemptTimestamp = user.last_login_attempt;
                    const lastSuccessfulTimestamp = user.last_successful_login;

                    if (lastAttemptTimestamp) {
                        const lastAttemptDate = new Date(lastAttemptTimestamp);
                        const lastSuccessfulDate = lastSuccessfulTimestamp ? new Date(lastSuccessfulTimestamp) : null;

                        if (lastSuccessfulDate && lastSuccessfulDate.getTime() === lastAttemptDate.getTime()) {
                            lastLoginReportMessage = `Your last login was successful at: ${lastAttemptDate.toLocaleString()}.`;
                        } else {
                            lastLoginReportMessage = `Your last login attempt was unsuccessful at: ${lastAttemptDate.toLocaleString()}.`;
                        }
                    } else {
                        lastLoginReportMessage = 'This is your first login.';
                    }

                    req.session.lastLoginReport = lastLoginReportMessage; // Store this detailed message in session

                    // Use prepared statement for run
                    updateSuccessfulLoginStmt.run(new Date().toISOString(), new Date().toISOString(), user.id);
                    return done(null, user); // Authentication successful
                } else {
                    // --- Incorrect Password & Lockout Increment ---
                    const newAttempts = user.login_attempts + 1;
                    const lockoutThreshold = 5; // 5 attempts
                    const lockoutPeriodSeconds = 10 * 60; // 10 minutes

                    if (newAttempts >= lockoutThreshold) {
                        const lockoutUntil = new Date(Date.now() + lockoutPeriodSeconds * 1000).toISOString();
                        // Use prepared statement for run
                        lockAccountStmt.run(newAttempts, lockoutUntil, new Date().toISOString(), user.id);
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    } else {
                        // Use prepared statement for run
                        updateFailedLoginAttemptStmt.run(newAttempts, new Date().toISOString(), user.id);
                        return done(null, false, { message: 'Invalid username and/or password' }); // Vague message
                    }
                }
            } catch (error) {
                console.error("Passport LocalStrategy error:", error.message);
                return done(error); // Pass database or other errors to Passport
            }
        }
    ));

    // Serialize user: Store only the user ID in the session
    passport.serializeUser((user, done) => {
        done(null, user.id); // Use user.id from the database record
    });

    // Deserialize user: Retrieve user object from the database using ID from session
    passport.deserializeUser(async (id, done) => {
        try {
            const user = getAccountById(id); // Synchronous call
            return done(null, user);
        } catch (error) {
            console.error("Passport Deserialize error:", error.message);
            return done(error);
        }
    });
};
