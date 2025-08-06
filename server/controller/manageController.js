// Import necessary modules
const { OccasioDB } = require('./../config/db'); // Adjust the path if your db.js is located elsewhere.
const multer = require('multer'); // For handling multipart/form-data (file uploads)

// Configure multer to store files in memory (for BLOB storage in SQLite)
const upload = multer({ storage: multer.memoryStorage() });

// Define constants for validation limits
const MIN_PRICE = 0.01;
const MAX_PRICE = 999999.99;
const MIN_STOCK = 0;
const MAX_STOCK = 99999;
const MIN_PRODUCT_NAME_LENGTH = 3;
const MAX_PRODUCT_NAME_LENGTH = 100;
const MIN_PRODUCT_FULL_NAME_LENGTH = 5;
const MAX_PRODUCT_FULL_NAME_LENGTH = 255;
const MIN_BRAND_LENGTH = 2;
const MAX_BRAND_LENGTH = 100;
const MIN_SKU_LENGTH = 3;
const MAX_SKU_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 1000;
const MAX_TYPE_LENGTH = 50;
const MAX_TAGS_PER_TYPE = 10;
const MAX_TAG_LENGTH_TYPE_OPTION = 50;
const MAX_TAG_LENGTH_FEATURE = 100;
const MAX_IMAGES = 5; // Max 5 images per product

// Helper function to get categories assigned to a specific employee (manager)
const getManagerCategories = (employeeId) => {
    const selectCategoriesStmt = OccasioDB.prepare(
        'SELECT category_name FROM employee_categories WHERE employee_id = ?'
    );
    const categories = selectCategoriesStmt.all(employeeId);
    return categories.map(row => row.category_name);
};

const controller = {

    // Multer middleware for handling multiple image uploads.
    // 'productImages' is the name attribute of the file input field on the frontend.
    // It will process up to 5 files.
    uploadImages: upload.array('productImages', MAX_IMAGES), // Max 5 images per product

    /**
     * Handles adding a new product to the database, including multiple images.
     * Expected req.body fields: product_name, product_full_name, description, category, brand, sku, price, stock, type, type_options, features
     * Expected req.files: Array of image files (from multer middleware)
     */
    addProduct: async (req, res) => {
        try {
            // Extract product details from the request body
            const {
                product_name,
                product_full_name,
                description,
                category,
                brand,
                sku,
                price,
                stock,
                type,
                type_options, // Frontend sends comma-separated string
                features      // Frontend sends comma-separated string
            } = req.body;

            // --- Backend Validation ---
            // Product Name
            if (!product_name || product_name.trim() === '') {
                return res.status(400).json({ message: 'Product Name is required.' });
            } else if (product_name.length < MIN_PRODUCT_NAME_LENGTH || product_name.length > MAX_PRODUCT_NAME_LENGTH) {
                return res.status(400).json({ message: `Product Name must be between ${MIN_PRODUCT_NAME_LENGTH} and ${MAX_PRODUCT_NAME_LENGTH} characters.` });
            }

            // Product Full Name
            if (!product_full_name || product_full_name.trim() === '') {
                return res.status(400).json({ message: 'Product Full Name is required.' });
            } else if (product_full_name.length < MIN_PRODUCT_FULL_NAME_LENGTH || product_full_name.length > MAX_PRODUCT_FULL_NAME_LENGTH) {
                return res.status(400).json({ message: `Product Full Name must be between ${MIN_PRODUCT_FULL_NAME_LENGTH} and ${MAX_PRODUCT_FULL_NAME_LENGTH} characters.` });
            }

            // Category
            if (!category || category.trim() === '' || category === 'Select Category') {
                return res.status(400).json({ message: 'Category is required.' });
            }

            // Brand
            if (!brand || brand.trim() === '') {
                return res.status(400).json({ message: 'Brand is required.' });
            } else if (brand.length < MIN_BRAND_LENGTH || brand.length > MAX_BRAND_LENGTH) {
                return res.status(400).json({ message: `Brand must be between ${MIN_BRAND_LENGTH} and ${MAX_BRAND_LENGTH} characters.` });
            }

            // SKU
            if (!sku || sku.trim() === '') {
                return res.status(400).json({ message: 'SKU is required.' });
            } else if (sku.length < MIN_SKU_LENGTH || sku.length > MAX_SKU_LENGTH) {
                return res.status(400).json({ message: `SKU must be between ${MIN_SKU_LENGTH} and ${MAX_SKU_LENGTH} characters.` });
            } else if (!/^[a-zA-Z0-9-]+$/.test(sku)) {
                return res.status(400).json({ message: 'SKU can only contain alphanumeric characters and hyphens.' });
            }

            // Price
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice < MIN_PRICE || parsedPrice > MAX_PRICE) {
                return res.status(400).json({ message: `Price must be between ₱${MIN_PRICE.toFixed(2)} and ₱${MAX_PRICE.toFixed(2)}.` });
            }

            // Stock Quantity
            const parsedStock = parseInt(stock, 10);
            if (isNaN(parsedStock) || parsedStock < MIN_STOCK || parsedStock > MAX_STOCK) {
                return res.status(400).json({ message: `Stock Quantity must be between ${MIN_STOCK} and ${MAX_STOCK}.` });
            }

            // Description (optional, max length)
            if (description && description.length > MAX_DESCRIPTION_LENGTH) {
                return res.status(400).json({ message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.` });
            }

            // Type (optional, max length)
            if (type && type.length > MAX_TYPE_LENGTH) {
                return res.status(400).json({ message: `Type cannot exceed ${MAX_TYPE_LENGTH} characters.` });
            }

            // Type Options (CSV string)
            const typeOptionsArray = type_options ? type_options.split(',').map(s => s.trim()).filter(Boolean) : [];
            if (typeOptionsArray.length > MAX_TAGS_PER_TYPE) {
                return res.status(400).json({ message: `You can add a maximum of ${MAX_TAGS_PER_TYPE} type options.` });
            }
            for (const option of typeOptionsArray) {
                if (option.length > MAX_TAG_LENGTH_TYPE_OPTION) {
                    return res.status(400).json({ message: `Each type option cannot exceed ${MAX_TAG_LENGTH_TYPE_OPTION} characters.` });
                }
            }

            // Features (CSV string)
            const featuresArray = features ? features.split(',').map(s => s.trim()).filter(Boolean) : [];
            if (featuresArray.length > MAX_TAGS_PER_TYPE) {
                return res.status(400).json({ message: `You can add a maximum of ${MAX_TAGS_PER_TYPE} features.` });
            }
            for (const feature of featuresArray) {
                if (feature.length > MAX_TAG_LENGTH_FEATURE) {
                    return res.status(400).json({ message: `Each feature cannot exceed ${MAX_TAG_LENGTH_FEATURE} characters.` });
                }
            }

            // Image Count
            if (!req.files || req.files.length === 0) {
                 // For adding a new product, at least one image is typically required.
                 // This check assumes at least one image is mandatory for new products.
                 return res.status(400).json({ message: 'At least one product image is required.' });
            }
            if (req.files.length > MAX_IMAGES) {
                return res.status(400).json({ message: `You can upload a maximum of ${MAX_IMAGES} images.` });
            }

            // --- End Backend Validation ---

            // Parse type_options and features from comma-separated string to JSON string
            const parsedTypeOptions = type_options ? JSON.stringify(typeOptionsArray) : null;
            const parsedFeatures = features ? JSON.stringify(featuresArray) : null;

            const currentTime = new Date().toISOString();

            // Start a database transaction for atomicity (product and images)
            OccasioDB.transaction(() => {
                // 1. Insert product details into the products table
                const insertProductStmt = OccasioDB.prepare(
                    `INSERT INTO products (
                        product_name, product_full_name, description, category, brand, sku, price, stock,
                        type, type_options, features, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
                );

                const productInfo = insertProductStmt.run(
                    product_name,
                    product_full_name,
                    description || null,
                    category,
                    brand,
                    sku,
                    parsedPrice,
                    parsedStock,
                    type || null,
                    parsedTypeOptions,
                    parsedFeatures,
                    currentTime,
                    currentTime
                );

                const newProductId = productInfo.lastInsertRowid;

                // 2. Insert associated images into the product_images table
                const insertImageStmt = OccasioDB.prepare(
                    `INSERT INTO product_images (product_id, image_data, image_mime_type, display_order, created_at)
                     VALUES (?, ?, ?, ?, ?)`
                );

                req.files.forEach((file, index) => {
                    insertImageStmt.run(
                        newProductId,
                        file.buffer,      // The image BLOB data
                        file.mimetype,      // The MIME type of the image
                        index,              // Simple display order
                        currentTime
                    );
                });
            })(); // Immediately invoke the transaction function

            res.status(201).json({ message: 'Product added successfully!' });

        } catch (error) {
            console.error('Error adding product:', error.message);
            if (error.message.includes('UNIQUE constraint failed: products.sku')) {
                return res.status(409).json({ message: 'Product with this SKU already exists.' });
            }
            res.status(500).json({ message: 'Failed to add product. An unexpected error occurred.' });
        }
    },

    /**
     * Handles updating an existing product and its images.
     * Expected req.body fields: all product fields, plus existingImageIds (array of IDs to keep)
     * Expected req.files: Array of new image files (from multer middleware)
     */
    editProduct: async (req, res) => {
        try {
            const productId = req.params.id; // Get product ID from URL parameter
            const {
                product_name, product_full_name, description, category, brand, sku, price, stock,
                type, type_options, features, existingImageIds // existingImageIds is a comma-separated string from frontend
            } = req.body;

            // --- Backend Validation ---
            // Product Name
            if (!product_name || product_name.trim() === '') {
                return res.status(400).json({ message: 'Product Name is required.' });
            } else if (product_name.length < MIN_PRODUCT_NAME_LENGTH || product_name.length > MAX_PRODUCT_NAME_LENGTH) {
                return res.status(400).json({ message: `Product Name must be between ${MIN_PRODUCT_NAME_LENGTH} and ${MAX_PRODUCT_NAME_LENGTH} characters.` });
            }

            // Product Full Name
            if (!product_full_name || product_full_name.trim() === '') {
                return res.status(400).json({ message: 'Product Full Name is required.' });
            } else if (product_full_name.length < MIN_PRODUCT_FULL_NAME_LENGTH || product_full_name.length > MAX_PRODUCT_FULL_NAME_LENGTH) {
                return res.status(400).json({ message: `Product Full Name must be between ${MIN_PRODUCT_FULL_NAME_LENGTH} and ${MAX_PRODUCT_FULL_NAME_LENGTH} characters.` });
            }

            // Category
            if (!category || category.trim() === '' || category === 'Select Category') {
                return res.status(400).json({ message: 'Category is required.' });
            }

            // Brand
            if (!brand || brand.trim() === '') {
                return res.status(400).json({ message: 'Brand is required.' });
            } else if (brand.length < MIN_BRAND_LENGTH || brand.length > MAX_BRAND_LENGTH) {
                return res.status(400).json({ message: `Brand must be between ${MIN_BRAND_LENGTH} and ${MAX_BRAND_LENGTH} characters.` });
            }

            // SKU
            if (!sku || sku.trim() === '') {
                return res.status(400).json({ message: 'SKU is required.' });
            } else if (sku.length < MIN_SKU_LENGTH || sku.length > MAX_SKU_LENGTH) {
                return res.status(400).json({ message: `SKU must be between ${MIN_SKU_LENGTH} and ${MAX_SKU_LENGTH} characters.` });
            } else if (!/^[a-zA-Z0-9-]+$/.test(sku)) {
                return res.status(400).json({ message: 'SKU can only contain alphanumeric characters and hyphens.' });
            }

            // Price
            const parsedPrice = parseFloat(price);
            if (isNaN(parsedPrice) || parsedPrice < MIN_PRICE || parsedPrice > MAX_PRICE) {
                return res.status(400).json({ message: `Price must be between ₱${MIN_PRICE.toFixed(2)} and ₱${MAX_PRICE.toFixed(2)}.` });
            }

            // Stock Quantity
            const parsedStock = parseInt(stock, 10);
            if (isNaN(parsedStock) || parsedStock < MIN_STOCK || parsedStock > MAX_STOCK) {
                return res.status(400).json({ message: `Stock Quantity must be between ${MIN_STOCK} and ${MAX_STOCK}.` });
            }

            // Description (optional, max length)
            if (description && description.length > MAX_DESCRIPTION_LENGTH) {
                return res.status(400).json({ message: `Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.` });
            }

            // Type (optional, max length)
            if (type && type.length > MAX_TYPE_LENGTH) {
                return res.status(400).json({ message: `Type cannot exceed ${MAX_TYPE_LENGTH} characters.` });
            }

            // Type Options (CSV string)
            const typeOptionsArray = type_options ? type_options.split(',').map(s => s.trim()).filter(Boolean) : [];
            if (typeOptionsArray.length > MAX_TAGS_PER_TYPE) {
                return res.status(400).json({ message: `You can add a maximum of ${MAX_TAGS_PER_TYPE} type options.` });
            }
            for (const option of typeOptionsArray) {
                if (option.length > MAX_TAG_LENGTH_TYPE_OPTION) {
                    return res.status(400).json({ message: `Each type option cannot exceed ${MAX_TAG_LENGTH_TYPE_OPTION} characters.` });
                }
            }

            // Features (CSV string)
            const featuresArray = features ? features.split(',').map(s => s.trim()).filter(Boolean) : [];
            if (featuresArray.length > MAX_TAGS_PER_TYPE) {
                return res.status(400).json({ message: `You can add a maximum of ${MAX_TAGS_PER_TYPE} features.` });
            }
            for (const feature of featuresArray) {
                if (feature.length > MAX_TAG_LENGTH_FEATURE) {
                    return res.status(400).json({ message: `Each feature cannot exceed ${MAX_TAG_LENGTH_FEATURE} characters.` });
                }
            }

            // Image Count (existing + new)
            const idsToKeep = existingImageIds ? existingImageIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
            const currentExistingImagesCount = idsToKeep.length;
            const newImagesCount = req.files ? req.files.length : 0;
            const totalImagesAfterUpdate = currentExistingImagesCount + newImagesCount;

            if (totalImagesAfterUpdate === 0) {
                return res.status(400).json({ message: 'At least one product image is required.' });
            }
            if (totalImagesAfterUpdate > MAX_IMAGES) {
                return res.status(400).json({ message: `You can have a maximum of ${MAX_IMAGES} images.` });
            }
            // --- End Backend Validation ---

            // Parse type_options and features
            const parsedTypeOptions = type_options ? JSON.stringify(typeOptionsArray) : null;
            const parsedFeatures = features ? JSON.stringify(featuresArray) : null;

            const currentTime = new Date().toISOString();

            OccasioDB.transaction(() => {
                // 1. Update product details in the products table
                const updateProductStmt = OccasioDB.prepare(
                    `UPDATE products SET
                        product_name = ?, product_full_name = ?, description = ?, category = ?, brand = ?, sku = ?, price = ?, stock = ?,
                        type = ?, type_options = ?, features = ?, updated_at = ?
                     WHERE id = ?`
                );

                const productInfo = updateProductStmt.run(
                    product_name,
                    product_full_name,
                    description || null,
                    category,
                    brand,
                    sku,
                    parsedPrice,
                    parsedStock,
                    type || null,
                    parsedTypeOptions,
                    parsedFeatures,
                    currentTime,
                    productId
                );

                if (productInfo.changes === 0) {
                    console.warn(`No product found or no changes made for ID: ${productId}`);
                }

                // 2. Delete images that are no longer in existingImageIds
                if (idsToKeep.length > 0) {
                    const placeholders = idsToKeep.map(() => '?').join(',');
                    const deleteImagesStmt = OccasioDB.prepare(
                        `DELETE FROM product_images WHERE product_id = ? AND id NOT IN (${placeholders})`
                    );
                    deleteImagesStmt.run(productId, ...idsToKeep);
                } else {
                    // If idsToKeep is empty, delete all images for this product
                    const deleteAllImagesStmt = OccasioDB.prepare(
                        `DELETE FROM product_images WHERE product_id = ?`
                    );
                    deleteAllImagesStmt.run(productId);
                }

                // 3. Insert new images
                if (req.files && req.files.length > 0) {
                    const insertImageStmt = OccasioDB.prepare(
                        `INSERT INTO product_images (product_id, image_data, image_mime_type, created_at)
                         VALUES (?, ?, ?, ?)`
                    );
                    req.files.forEach((file) => {
                        insertImageStmt.run(
                            productId,
                            file.buffer,
                            file.mimetype,
                            currentTime
                        );
                    });
                }
            })(); // Immediately invoke the transaction function

            res.status(200).json({ message: 'Product updated successfully!' });

        } catch (error) {
            console.error('Error updating product:', error.message);
            if (error.message.includes('UNIQUE constraint failed: products.sku')) {
                return res.status(409).json({ message: 'Product with this SKU already exists.' });
            }
            res.status(500).json({ message: 'Failed to update product. An unexpected error occurred.' });
        }
    },

    /**
     * Handles deleting a product and its associated images.
     */
    deleteProduct: async (req, res) => {
        try {
            const productId = req.params.id; // Get product ID from URL parameter

            // Use a transaction to ensure both product and its images are deleted
            OccasioDB.transaction(() => {
                // The ON DELETE CASCADE in product_images table schema handles image deletion automatically
                // if product_id is a foreign key with ON DELETE CASCADE.
                // So, just deleting the product is enough.
                const deleteProductStmt = OccasioDB.prepare('DELETE FROM products WHERE id = ?');
                const info = deleteProductStmt.run(productId);

                if (info.changes === 0) {
                    return res.status(404).json({ message: 'Product not found.' });
                }
            })(); // Immediately invoke the transaction function

            res.status(200).json({ message: 'Product deleted successfully!' });

        } catch (error) {
            console.error('Error deleting product:', error.message);
            res.status(500).json({ message: 'Failed to delete product. An unexpected error occurred.' });
        }
    },

    /**
     * Fetches all products with their first associated image.
     * Filters products by categories assigned to the manager.
     */
    getProducts: async (req, res) => {
        try {
            const managerId = req.user.id; // Get manager ID from authenticated user
            const managerAssignedCategories = getManagerCategories(managerId);

            let products = [];
            let selectProductsStmt;

            if (managerAssignedCategories && managerAssignedCategories.length > 0) {
                const placeholders = managerAssignedCategories.map(() => '?').join(',');
                selectProductsStmt = OccasioDB.prepare(
                    `SELECT
                        p.*,
                        (SELECT image_data FROM product_images WHERE product_id = p.id ORDER BY display_order ASC LIMIT 1) AS image_data,
                        (SELECT image_mime_type FROM product_images WHERE product_id = p.id ORDER BY display_order ASC LIMIT 1) AS image_mime_type,
                        (SELECT GROUP_CONCAT(id) FROM product_images WHERE product_id = p.id) AS image_ids_csv
                     FROM products p
                     WHERE p.category IN (${placeholders})`
                );
                products = selectProductsStmt.all(...managerAssignedCategories);
            } else {
                // If manager has no assigned categories, return no products
                products = [];
            }

            // Transform image_data to base64 URL for frontend display
            const productsWithImages = products.map(product => {
                let imageUrl = null;
                if (product.image_data && product.image_mime_type) {
                    imageUrl = `data:${product.image_mime_type};base64,${product.image_data.toString('base64')}`;
                }

                // Parse type_options and features from JSON string back to array/string if needed for frontend
                let typeOptionsString = '';
                try {
                    const parsed = JSON.parse(product.type_options);
                    typeOptionsString = Array.isArray(parsed) ? parsed.join(',') : '';
                } catch (e) { /* ignore parse error, keep empty string */ }

                let featuresString = '';
                try {
                    const parsed = JSON.parse(product.features);
                    featuresString = Array.isArray(parsed) ? parsed.join(',') : '';
                } catch (e) { /* ignore parse error, keep empty string */ }

                return {
                    ...product,
                    image_data: undefined, // Remove raw BLOB data from response
                    image_mime_type: undefined, // Remove raw MIME type from response
                    image_url: imageUrl, // Add base64 URL for the first image
                    // Provide all image IDs for the edit modal to track existing images
                    existing_image_ids: product.image_ids_csv ? product.image_ids_csv.split(',').map(Number) : [],
                    type_options: typeOptionsString, // Convert back to comma-separated string
                    features: featuresString // Convert back to comma-separated string
                };
            });

            res.status(200).json(productsWithImages);

        } catch (error) {
            console.error('Error fetching products:', error.message);
            res.status(500).json({ message: 'Failed to fetch products.' });
        }
    },

    /**
     * Serves a specific product image BLOB by its ID from the product_images table.
     */
    getProductImage: async (req, res) => {
        try {
            const imageId = req.params.id; // Get image ID from URL parameter
            const getImageStmt = OccasioDB.prepare('SELECT image_data, image_mime_type FROM product_images WHERE id = ?');
            const imageRecord = getImageStmt.get(imageId);

            if (imageRecord && imageRecord.image_data) {
                res.writeHead(200, {
                    'Content-Type': imageRecord.image_mime_type || 'application/octet-stream', // Fallback MIME type
                    'Content-Length': imageRecord.image_data.length
                });
                res.end(imageRecord.image_data); // Send the raw binary data (Buffer)
            } else {
                res.status(404).send('Image not found.');
            }
        } catch (error) {
            console.error('Error serving product image BLOB:', error.message);
            res.status(500).send('Failed to retrieve image.');
        }
    },

    /**
     * Fetches all orders.
     * Filters orders by products that fall under manager's assigned categories.
     */
    getOrders: async (req, res) => {
        try {
            // Ensure req.user and req.user.id are available from authentication middleware
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: 'Unauthorized: Manager ID not found.' });
            }

            const managerId = req.user.id; // Get manager ID from authenticated user
            const managerAssignedCategories = getManagerCategories(managerId);

            // If the manager has no assigned categories, return an empty array of orders
            if (!managerAssignedCategories || managerAssignedCategories.length === 0) {
                return res.status(200).json([]);
            }

            // Fetch all orders
            const selectOrdersStmt = OccasioDB.prepare('SELECT * FROM orders');
            const allOrders = selectOrdersStmt.all();

            // Filter orders based on whether any product in the order belongs to the manager's categories
            const filteredOrders = allOrders.filter(order => {
                try {
                    const productsOrdered = JSON.parse(order.products_ordered);
                    // Check if at least one product in the order has a category assigned to the manager
                    return productsOrdered.some(orderedProduct =>
                        orderedProduct.category && managerAssignedCategories.includes(orderedProduct.category)
                    );
                } catch (e) {
                    console.error("Error parsing products_ordered JSON for order ID:", order.id, e);
                    // If parsing fails, exclude this order to prevent errors
                    return false;
                }
            });

            res.status(200).json(filteredOrders);

        } catch (error) {
            console.error('Error fetching orders:', error.message);
            res.status(500).json({ message: 'Failed to fetch orders.' });
        }
    },

    /**
     * Updates the status of an order.
     */
    updateOrderStatus: async (req, res) => {
        try {
            const orderId = req.params.id;
            const { status } = req.body;

            if (!status) {
                return res.status(400).json({ message: 'New status is required.' });
            }

            const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
            if (!validStatuses.includes(status.toLowerCase())) { // Ensure case-insensitivity or match DB enum
                return res.status(400).json({ message: 'Invalid order status provided.' });
            }

            const updateOrderStmt = OccasioDB.prepare(
                'UPDATE orders SET status = ?, updated_at = ? WHERE id = ?'
            );
            const currentTime = new Date().toISOString();
            const info = updateOrderStmt.run(status.toLowerCase(), currentTime, orderId); // Store as lowercase

            if (info.changes === 0) {
                return res.status(404).json({ message: 'Order not found or no changes made.' });
            }

            res.status(200).json({ message: 'Order status updated successfully.' });

        } catch (error) {
            console.error('Error updating order status:', error.message);
            res.status(500).json({ message: 'Failed to update order status.' });
        }
    },

    /**
     * Fetches all categories assigned to the currently logged-in manager.
     */
    getCategories: async (req, res) => {
        try {
            if (!req.user || !req.user.id) {
                return res.status(401).json({ message: 'Unauthorized: Manager ID not found.' });
            }
            const managerId = req.user.id;
            const categories = getManagerCategories(managerId);
            res.status(200).json(categories);
        } catch (error) {
            console.error('Error fetching assigned categories:', error.message);
            res.status(500).json({ message: 'Failed to fetch assigned categories.' });
        }
    }
};

module.exports = controller;
