-- accounts table
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    address TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL, -- Stores 'admin', 'manager', or 'customer'
    login_attempts INTEGER DEFAULT 0 NOT NULL,
    lockout_until TEXT, -- Stores ISO 8601 strings for DATETIME. Presence implies locked.
    last_successful_login TEXT,
    last_password_change TEXT,
    last_login_attempt TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    profile_image_blob BLOB,
    profile_image_mime_type TEXT, -- e.g., 'image/png', 'image/jpeg'
);

-- employee_categories table
CREATE TABLE employee_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    category_name TEXT NOT NULL, -- The name of the category assigned to the employee
    created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL,
    -- Ensure an employee can only be assigned to a specific category once
    UNIQUE(employee_id, category_name),
    -- Foreign key constraint to link to the accounts table (for employees)
    FOREIGN KEY (employee_id) REFERENCES accounts(id) ON DELETE CASCADE
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
    question_text TEXT NOT NULL, -- This will store the text of the pre-defined question chosen by the user
    answer_hash TEXT NOT NULL,
    FOREIGN KEY (account_id) REFERENCES accounts(id)
);

-- products table
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_name TEXT NOT NULL,
    product_full_name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    brand TEXT NOT NULL,
    sku TEXT NOT NULL UNIQUE,
    price REAL NOT NULL,
    type TEXT, -- e.g., "Color", "Size"
    type_options TEXT, -- Stores JSON string, e.g., '["Yellow", "White", "Blue"]'
    features TEXT, -- Stores JSON string, e.g., '["100% Cotton", "Breathable", "Unisex"]'
    created_at TEXT NOT NULL, -- ISO 8601 format
    updated_at TEXT -- ISO 8601 format
);

-- product_images table (NEW: for multiple images per product)
CREATE TABLE product_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL, -- Foreign key linking to the products table
    image_data BLOB NOT NULL,   -- Stores the raw binary data of the image
    image_mime_type TEXT NOT NULL, -- e.g., 'image/png', 'image/jpeg' - crucial for serving
    display_order INTEGER,      -- Optional: to define the order of images (e.g., main image first)
    created_at TEXT NOT NULL,   -- ISO 8601 format
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- orders table
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    order_date TEXT NOT NULL, -- ISO 8601 format
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')) DEFAULT 'pending',
    total_amount REAL NOT NULL,
    products_ordered TEXT NOT NULL, -- JSON string: '[{"product_id": 1, "name": "T-Shirt", "price_at_order": 29.99, "quantity": 2, "selected_options": {"color": "Yellow"}}]'
    shipping_address TEXT, -- Optional JSON string of shipping details
    payment_status TEXT, -- Optional: 'paid', 'unpaid', 'refunded'
    updated_at TEXT, -- ISO 8601 format, for status changes
    FOREIGN KEY (customer_id) REFERENCES accounts(id)
);
