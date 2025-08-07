// Import necessary modules
const { OccasioDB } = require('./../config/db');
/**
 * Audit Logger Utility Function
 * A centralized function to handle inserting logs into the audit_logs table.
 * This keeps the main controller logic cleaner and reduces code repetition.
 * @param {object} logDetails - The details of the event to log.
 * @param {string} logDetails.eventType - The type of event (e.g., 'Authentication', 'Account Management').
 * @param {number|null} logDetails.userId - The ID of the user, if available.
 * @param {string} logDetails.username - The username involved in the event.
 * @param {string} logDetails.ip_address - The IP address from which the request originated.
 * @param {string} logDetails.status - The status of the event ('Success' or 'Failure').
 * @param {string} logDetails.description - A detailed description of the event.
 */
const auditLogger = ({ eventType, userId, username, ip_address, status, description }) => {
    try {
        const stmt = OccasioDB.prepare(
            'INSERT INTO audit_logs (event_type, user_id, username, ip_address, status, description) VALUES (?, ?, ?, ?, ?, ?)'
        );
        stmt.run(eventType, userId, username, ip_address, status, description);
    } catch (error) {
        // If logging fails, we log it to the console. We don't want to interrupt the user's action for a logging failure.
        console.error('Failed to write to audit log:', error);
    }
};

module.exports = { auditLogger };
