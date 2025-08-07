const { OccasioDB } = require('./../config/db');

const auditLogger = ({ eventType, userId, username, ip_address, status, description }) => {
    try {
        const stmt = OccasioDB.prepare(
            'INSERT INTO audit_logs (event_type, user_id, username, ip_address, status, description) VALUES (?, ?, ?, ?, ?, ?)'
        );
        stmt.run(eventType, userId, username, ip_address, status, description);
    } catch (error) {
        console.error('Failed to write to audit log:', error);
    }
};

module.exports = { auditLogger };
