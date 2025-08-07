CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    address TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    login_attempts INTEGER DEFAULT 0 NOT NULL,
    lockout_until TEXT,
    last_successful_login TEXT,
    last_password_change TEXT,
    last_login_attempt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    profile_image_blob BLOB,
    profile_image_mime_type TEXT, 
);

CREATE TABLE employee_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    category_name TEXT NOT NULL, 
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(employee_id, category_name),
    FOREIGN KEY (employee_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE password_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE security_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    question_text TEXT NOT NULL, 
    answer_hash TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    product_full_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0, 
    type TEXT, 
    type_options TEXT,
    features TEXT,
    created_at TEXT NOT NULL, 
    updated_at TEXT 
);

CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL, 
    image_data BLOB NOT NULL,  
    image_mime_type TEXT NOT NULL, 
    display_order INTEGER,    
    created_at TEXT NOT NULL,   
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    order_date TEXT NOT NULL, 
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
    total_amount REAL NOT NULL,
    products_ordered TEXT NOT NULL,
    shipping_address TEXT, 
    payment_status TEXT,
    updated_at TEXT, 
    FOREIGN KEY (customer_id) REFERENCES accounts(id)
);

CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('Authentication', 'Access Control', 'Input Validation', 'Account Management', 'Order Management')),
    user_id INTEGER,
    username TEXT, 
    ip_address TEXT,
    status TEXT NOT NULL CHECK (status IN ('Success', 'Failure')),
    description TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES accounts(id) ON DELETE SET NULL
);
