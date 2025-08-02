-- accounts table
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- Stores 'admin', 'manager', or 'customer'
    login_attempts INTEGER DEFAULT 0 NOT NULL,
    lockout_until TEXT, -- Stores ISO 8601 strings for DATETIME. Presence implies locked.
    last_successful_login TEXT,
    last_password_change TEXT,
    last_login_attempt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- password_history table
CREATE TABLE password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- security_questions table
CREATE TABLE security_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    question_text TEXT NOT NULL,
    answer_hash TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);
