// Import necessary modules
const { OccasioDB } = require('./../config/db');
const multer = require('multer');
const { auditLogger } = require('./../middleware/auditLogger')

// Configure multer
const upload = multer({ storage: multer.memoryStorage() });

// Define constants for validation
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
const MAX_IMAGES = 5;

// Helper function
const getManagerCategories = (employeeId) => {
    const selectCategoriesStmt = OccasioDB.prepare('SELECT category_name FROM employee_categories WHERE employee_id = ?');
    const categories = selectCategoriesStmt.all(employeeId);
    return categories.map(row => row.category_name);
};

const controller = {

    uploadImages: upload.array('productImages', MAX_IMAGES),

    addProduct: async (req, res) => {
        const { product_name, product_full_name, description, category, brand, sku, price, stock, type, type_options, features } = req.body;
        const errors = [];

        // --- Backend Validation ---
        if (!product_name || product_name.trim() === '') errors.push('Product Name is required.');
        else if (product_name.length < MIN_PRODUCT_NAME_LENGTH || product_name.length > MAX_PRODUCT_NAME_LENGTH) errors.push(`Product Name must be between ${MIN_PRODUCT_NAME_LENGTH} and ${MAX_PRODUCT_NAME_LENGTH} characters.`);
        if (!product_full_name || product_full_name.trim() === '') errors.push('Product Full Name is required.');
        else if (product_full_name.length < MIN_PRODUCT_FULL_NAME_LENGTH || product_full_name.length > MAX_PRODUCT_FULL_NAME_LENGTH) errors.push(`Product Full Name must be between ${MIN_PRODUCT_FULL_NAME_LENGTH} and ${MAX_PRODUCT_FULL_NAME_LENGTH} characters.`);
        if (!category || category.trim() === '' || category === 'Select Category') errors.push('Category is required.');
        if (!brand || brand.trim() === '') errors.push('Brand is required.');
        else if (brand.length < MIN_BRAND_LENGTH || brand.length > MAX_BRAND_LENGTH) errors.push(`Brand must be between ${MIN_BRAND_LENGTH} and ${MAX_BRAND_LENGTH} characters.`);
        if (!sku || sku.trim() === '') errors.push('SKU is required.');
        else if (sku.length < MIN_SKU_LENGTH || sku.length > MAX_SKU_LENGTH) errors.push(`SKU must be between ${MIN_SKU_LENGTH} and ${MAX_SKU_LENGTH} characters.`);
        else if (!/^[a-zA-Z0-9-]+$/.test(sku)) errors.push('SKU can only contain alphanumeric characters and hyphens.');
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < MIN_PRICE || parsedPrice > MAX_PRICE) errors.push(`Price must be between ₱${MIN_PRICE.toFixed(2)} and ₱${MAX_PRICE.toFixed(2)}.`);
        const parsedStock = parseInt(stock, 10);
        if (isNaN(parsedStock) || parsedStock < MIN_STOCK || parsedStock > MAX_STOCK) errors.push(`Stock Quantity must be between ${MIN_STOCK} and ${MAX_STOCK}.`);
        if (description && description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`);
        if (type && type.length > MAX_TYPE_LENGTH) errors.push(`Type cannot exceed ${MAX_TYPE_LENGTH} characters.`);
        const typeOptionsArray = type_options ? type_options.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (typeOptionsArray.length > MAX_TAGS_PER_TYPE) errors.push(`You can add a maximum of ${MAX_TAGS_PER_TYPE} type options.`);
        if (typeOptionsArray.some(o => o.length > MAX_TAG_LENGTH_TYPE_OPTION)) errors.push(`Each type option cannot exceed ${MAX_TAG_LENGTH_TYPE_OPTION} characters.`);
        const featuresArray = features ? features.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (featuresArray.length > MAX_TAGS_PER_TYPE) errors.push(`You can add a maximum of ${MAX_TAGS_PER_TYPE} features.`);
        if (featuresArray.some(f => f.length > MAX_TAG_LENGTH_FEATURE)) errors.push(`Each feature cannot exceed ${MAX_TAG_LENGTH_FEATURE} characters.`);
        if (!req.files || req.files.length === 0) errors.push('At least one product image is required.');
        if (req.files && req.files.length > MAX_IMAGES) errors.push(`You can upload a maximum of ${MAX_IMAGES} images.`);

        if (errors.length > 0) {
            // 🪵 Audit Log: Input Validation Failure
            auditLogger({
                eventType: 'Input Validation',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `Failed to add product '${product_name || 'N/A'}'. Reason: ${errors[0]}`
            });
            return res.status(400).json({ message: errors[0] });
        }
        // --- End Backend Validation ---

        try {
            const parsedTypeOptions = type_options ? JSON.stringify(typeOptionsArray) : null;
            const parsedFeatures = features ? JSON.stringify(featuresArray) : null;
            const currentTime = new Date().toISOString();

            OccasioDB.transaction(() => {
                const insertProductStmt = OccasioDB.prepare(`INSERT INTO products (product_name, product_full_name, description, category, brand, sku, price, stock, type, type_options, features, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
                const productInfo = insertProductStmt.run(product_name, product_full_name, description || null, category, brand, sku, parsedPrice, parsedStock, type || null, parsedTypeOptions, parsedFeatures, currentTime, currentTime);
                const newProductId = productInfo.lastInsertRowid;
                const insertImageStmt = OccasioDB.prepare(`INSERT INTO product_images (product_id, image_data, image_mime_type, display_order, created_at) VALUES (?, ?, ?, ?, ?)`);
                req.files.forEach((file, index) => {
                    insertImageStmt.run(newProductId, file.buffer, file.mimetype, index, currentTime);
                });
            })();

            // 🪵 Audit Log: Product Added Successfully
            auditLogger({
                eventType: 'Order Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Success',
                description: `User successfully added a new product: '${product_name}' (SKU: ${sku}).`
            });
            res.status(201).json({ message: 'Product added successfully!' });

        } catch (error) {
            let description = `Failed to add product '${product_name}'. Reason: An unexpected error occurred.`;
            let statusCode = 500;
            let responseMessage = 'Failed to add product. An unexpected error occurred.';

            if (error.message.includes('UNIQUE constraint failed: products.sku')) {
                description = `Failed to add product '${product_name}'. Reason: SKU '${sku}' already exists.`;
                statusCode = 409;
                responseMessage = 'Product with this SKU already exists.';
            }
            // 🪵 Audit Log: Product Add Failure
            auditLogger({
                eventType: 'Account Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: description
            });
            console.error('Error adding product:', error.message);
            res.status(statusCode).json({ message: responseMessage });
        }
    },

    editProduct: async (req, res) => {
        const productId = req.params.id;
        const { product_name, product_full_name, description, category, brand, sku, price, stock, type, type_options, features, existingImageIds } = req.body;
        const errors = [];

        // --- Backend Validation ---
        if (!product_name || product_name.trim() === '') errors.push('Product Name is required.');
        else if (product_name.length < MIN_PRODUCT_NAME_LENGTH || product_name.length > MAX_PRODUCT_NAME_LENGTH) errors.push(`Product Name must be between ${MIN_PRODUCT_NAME_LENGTH} and ${MAX_PRODUCT_NAME_LENGTH} characters.`);
        if (!product_full_name || product_full_name.trim() === '') errors.push('Product Full Name is required.');
        else if (product_full_name.length < MIN_PRODUCT_FULL_NAME_LENGTH || product_full_name.length > MAX_PRODUCT_FULL_NAME_LENGTH) errors.push(`Product Full Name must be between ${MIN_PRODUCT_FULL_NAME_LENGTH} and ${MAX_PRODUCT_FULL_NAME_LENGTH} characters.`);
        if (!category || category.trim() === '' || category === 'Select Category') errors.push('Category is required.');
        if (!brand || brand.trim() === '') errors.push('Brand is required.');
        else if (brand.length < MIN_BRAND_LENGTH || brand.length > MAX_BRAND_LENGTH) errors.push(`Brand must be between ${MIN_BRAND_LENGTH} and ${MAX_BRAND_LENGTH} characters.`);
        if (!sku || sku.trim() === '') errors.push('SKU is required.');
        else if (sku.length < MIN_SKU_LENGTH || sku.length > MAX_SKU_LENGTH) errors.push(`SKU must be between ${MIN_SKU_LENGTH} and ${MAX_SKU_LENGTH} characters.`);
        else if (!/^[a-zA-Z0-9-]+$/.test(sku)) errors.push('SKU can only contain alphanumeric characters and hyphens.');
        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice < MIN_PRICE || parsedPrice > MAX_PRICE) errors.push(`Price must be between ₱${MIN_PRICE.toFixed(2)} and ₱${MAX_PRICE.toFixed(2)}.`);
        const parsedStock = parseInt(stock, 10);
        if (isNaN(parsedStock) || parsedStock < MIN_STOCK || parsedStock > MAX_STOCK) errors.push(`Stock Quantity must be between ${MIN_STOCK} and ${MAX_STOCK}.`);
        if (description && description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Description cannot exceed ${MAX_DESCRIPTION_LENGTH} characters.`);
        if (type && type.length > MAX_TYPE_LENGTH) errors.push(`Type cannot exceed ${MAX_TYPE_LENGTH} characters.`);
        const typeOptionsArray = type_options ? type_options.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (typeOptionsArray.length > MAX_TAGS_PER_TYPE) errors.push(`You can add a maximum of ${MAX_TAGS_PER_TYPE} type options.`);
        if (typeOptionsArray.some(o => o.length > MAX_TAG_LENGTH_TYPE_OPTION)) errors.push(`Each type option cannot exceed ${MAX_TAG_LENGTH_TYPE_OPTION} characters.`);
        const featuresArray = features ? features.split(',').map(s => s.trim()).filter(Boolean) : [];
        if (featuresArray.length > MAX_TAGS_PER_TYPE) errors.push(`You can add a maximum of ${MAX_TAGS_PER_TYPE} features.`);
        if (featuresArray.some(f => f.length > MAX_TAG_LENGTH_FEATURE)) errors.push(`Each feature cannot exceed ${MAX_TAG_LENGTH_FEATURE} characters.`);
        const idsToKeep = existingImageIds ? existingImageIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
        const totalImagesAfterUpdate = idsToKeep.length + (req.files ? req.files.length : 0);
        if (totalImagesAfterUpdate === 0) errors.push('At least one product image is required.');
        if (totalImagesAfterUpdate > MAX_IMAGES) errors.push(`You can have a maximum of ${MAX_IMAGES} images.`);

        if (errors.length > 0) {
            // 🪵 Audit Log: Input Validation Failure
            auditLogger({
                eventType: 'Input Validation',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `Failed to edit product ID ${productId}. Reason: ${errors[0]}`
            });
            return res.status(400).json({ message: errors[0] });
        }
        // --- End Backend Validation ---

        try {
            const parsedTypeOptions = type_options ? JSON.stringify(typeOptionsArray) : null;
            const parsedFeatures = features ? JSON.stringify(featuresArray) : null;
            const currentTime = new Date().toISOString();

            OccasioDB.transaction(() => {
                const updateProductStmt = OccasioDB.prepare(`UPDATE products SET product_name = ?, product_full_name = ?, description = ?, category = ?, brand = ?, sku = ?, price = ?, stock = ?, type = ?, type_options = ?, features = ?, updated_at = ? WHERE id = ?`);
                updateProductStmt.run(product_name, product_full_name, description || null, category, brand, sku, parsedPrice, parsedStock, type || null, parsedTypeOptions, parsedFeatures, currentTime, productId);

                // Image handling logic
                const idsToKeep = existingImageIds ? existingImageIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id)) : [];
                if (idsToKeep.length > 0) {
                    const placeholders = idsToKeep.map(() => '?').join(',');
                    const deleteImagesStmt = OccasioDB.prepare(`DELETE FROM product_images WHERE product_id = ? AND id NOT IN (${placeholders})`);
                    deleteImagesStmt.run(productId, ...idsToKeep);
                } else {
                    const deleteAllImagesStmt = OccasioDB.prepare(`DELETE FROM product_images WHERE product_id = ?`);
                    deleteAllImagesStmt.run(productId);
                }
                if (req.files && req.files.length > 0) {
                    const insertImageStmt = OccasioDB.prepare(`INSERT INTO product_images (product_id, image_data, image_mime_type, created_at) VALUES (?, ?, ?, ?)`);
                    req.files.forEach((file) => {
                        insertImageStmt.run(productId, file.buffer, file.mimetype, currentTime);
                    });
                }
            })();

            // 🪵 Audit Log: Product Edited Successfully
            auditLogger({
                eventType: 'Order Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Success',
                description: `User successfully edited product: '${product_name}' (ID: ${productId}).`
            });
            res.status(200).json({ message: 'Product updated successfully!' });

        } catch (error) {
            let description = `Failed to edit product '${product_name}'. Reason: An unexpected error occurred.`;
            let statusCode = 500;
            let responseMessage = 'Failed to edit product. An unexpected error occurred.';

            if (error.message.includes('UNIQUE constraint failed: products.sku')) {
                description = `Failed to edit product '${product_name}'. Reason: SKU '${sku}' already exists.`;
                statusCode = 409;
                responseMessage = 'Product with this SKU already exists.';
            }
            // 🪵 Audit Log: Product Edit Failure
            auditLogger({
                eventType: 'Account Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: description
            });
            console.error('Error updating product:', error.message);
            res.status(statusCode).json({ message: responseMessage });
        }
    },

    deleteProduct: async (req, res) => {
        const productId = req.params.id;
        try {
            let productName = `ID ${productId}`;
            const getProductStmt = OccasioDB.prepare('SELECT product_name FROM products WHERE id = ?');
            const product = getProductStmt.get(productId);
            if (product) productName = product.product_name;

            const deleteProductStmt = OccasioDB.prepare('DELETE FROM products WHERE id = ?');
            const info = deleteProductStmt.run(productId);

            if (info.changes === 0) {
                // 🪵 Audit Log: Delete Failure (Not Found)
                auditLogger({
                    eventType: 'Account Management',
                    userId: req.user.id,
                    username: req.user.username,
                    ip_address: req.ip,
                    status: 'Failure',
                    description: `User failed to delete product with ID ${productId}. Reason: Product not found.`
                });
                return res.status(404).json({ message: 'Product not found.' });
            }

            // 🪵 Audit Log: Product Deleted Successfully
            auditLogger({
                eventType: 'Order Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Success',
                description: `User successfully deleted product: '${productName}' (ID: ${productId}).`
            });
            res.status(200).json({ message: 'Product deleted successfully!' });

        } catch (error) {
            // 🪵 Audit Log: Delete Failure (Error)
            auditLogger({
                eventType: 'Account Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `User failed to delete product with ID ${productId}. Reason: ${error.message}`
            });
            console.error('Error deleting product:', error.message);
            res.status(500).json({ message: 'Failed to delete product. An unexpected error occurred.' });
        }
    },

    updateOrderStatus: async (req, res) => {
        const orderId = req.params.id;
        const { status } = req.body;

        // --- Validation ---
        if (!status) {
            auditLogger({ eventType: 'Input Validation', userId: req.user.id, username: req.user.username, ip_address: req.ip, status: 'Failure', description: `Order status update failed for order ID ${orderId}. Reason: Status is required.` });
            return res.status(400).json({ message: 'New status is required.' });
        }
        const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
        if (!validStatuses.includes(status.toLowerCase())) {
            auditLogger({ eventType: 'Input Validation', userId: req.user.id, username: req.user.username, ip_address: req.ip, status: 'Failure', description: `Order status update failed for order ID ${orderId}. Reason: Invalid status '${status}'.` });
            return res.status(400).json({ message: 'Invalid order status provided.' });
        }
        // --- End Validation ---

        try {
            const updateOrderStmt = OccasioDB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?');
            const info = updateOrderStmt.run(status.toLowerCase(), new Date().toISOString(), orderId);

            if (info.changes === 0) {
                auditLogger({ eventType: 'Account Management', userId: req.user.id, username: req.user.username, ip_address: req.ip, status: 'Failure', description: `Order status update failed for order ID ${orderId}. Reason: Order not found.` });
                return res.status(404).json({ message: 'Order not found or no changes made.' });
            }

            auditLogger({ eventType: 'Account Management', userId: req.user.id, username: req.user.username, ip_address: req.ip, status: 'Success', description: `User updated order ID ${orderId} to status '${status}'.` });
            res.status(200).json({ message: 'Order status updated successfully.' });

        } catch (error) {
            auditLogger({
                eventType: 'Account Management',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `Order status update failed for order ID ${orderId}. Reason: ${error.message}`
            });
            console.error('Error updating order status:', error.message);
            res.status(500).json({ message: 'Failed to update order status.' });
        }
    },

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

    getProductImage: async (req, res) => {
        try {
            const imageId = req.params.id;
            const getImageStmt = OccasioDB.prepare('SELECT image_data, image_mime_type FROM product_images WHERE id = ?');
            const imageRecord = getImageStmt.get(imageId);
            if (imageRecord && imageRecord.image_data) {
                res.writeHead(200, { 'Content-Type': imageRecord.image_mime_type || 'application/octet-stream', 'Content-Length': imageRecord.image_data.length });
                res.end(imageRecord.image_data);
            } else {
                res.status(404).send('Image not found.');
            }
        } catch (error) {
            console.error('Error serving product image BLOB:', error.message);
            res.status(500).send('Failed to retrieve image.');
        }
    },

    getOrders: async (req, res) => {
        try {
            const managerId = req.user.id;
            const managerAssignedCategories = getManagerCategories(managerId);
            if (!managerAssignedCategories || managerAssignedCategories.length === 0) {
                return res.status(200).json([]);
            }
            const selectOrdersStmt = OccasioDB.prepare('SELECT * FROM orders');
            const allOrders = selectOrdersStmt.all();
            const filteredOrders = allOrders.filter(order => {
                try {
                    const productsOrdered = JSON.parse(order.products_ordered);
                    return productsOrdered.some(orderedProduct => orderedProduct.category && managerAssignedCategories.includes(orderedProduct.category));
                } catch (e) {
                    console.error("Error parsing products_ordered JSON for order ID:", order.id, e);
                    return false;
                }
            });
            res.status(200).json(filteredOrders);
        } catch (error) {
            console.error('Error fetching orders:', error.message);
            res.status(500).json({ message: 'Failed to fetch orders.' });
        }
    },

    getCategories: async (req, res) => {
        try {
            const managerId = req.user.id;
            const categories = getManagerCategories(managerId);
            res.status(200).json(categories);
        } catch (error) {
            console.error('Error fetching assigned categories:', error.message);
            res.status(500).json({ message: 'Failed to fetch assigned categories.' });
        }
    },

    getDashboardData: async (req, res) => {
        try {
   
            // 3. Fetch Audit Logs
            const auditLogStmt = OccasioDB.prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC");
            const auditLogs = auditLogStmt.all();

            // 4. Send all data in a single JSON response
            res.status(200).json(
                auditLogs
            );

        } catch (error) {
            // Log the error using the audit logger for tracking
            auditLogger({
                eventType: 'Access Control',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `Admin failed to fetch dashboard data. Reason: ${error.message}`
            });
            console.error('Error fetching dashboard data:', error.message);
            res.status(500).json({ message: 'Failed to fetch dashboard data.' });
        }
    }
};

module.exports = controller;
