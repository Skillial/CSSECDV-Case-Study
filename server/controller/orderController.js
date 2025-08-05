// server/controller/orderController.js
const { OccasioDB } = require('./../config/db');

const orderController = {
    /**
     * Handles adding a new order to the database.
     * Expected req.body: { productId: string, quantity: number, selectedOptions: object, category: string }
     */
    addOrder: async (req, res) => {
        // Ensure user is authenticated
        if (!req.isAuthenticated()) {
            // Send JSON response for AJAX call, not redirect
            return res.status(401).json({ message: 'You must be logged in to place an order.' });
        }

        // Destructure category from req.body as it's now being sent from the frontend
        const { productId, quantity, selectedOptions, category } = req.body;
        const customerId = req.user.id; // Get customer ID from authenticated user

        // Basic server-side validation
        if (!productId || !quantity || quantity <= 0) {
            return res.status(400).json({ message: 'Invalid product or quantity provided.' });
        }
        // Add validation for category if it's mandatory
        if (!category || typeof category !== 'string' || category.trim() === '') {
            return res.status(400).json({ message: 'Product category is required.' });
        }

        try {
            // Start a database transaction for atomicity (ensure stock update and order creation are linked)
            OccasioDB.transaction(() => {
                // 1. Fetch product details to verify existence, price, and current stock
                const getProductStmt = OccasioDB.prepare(
                    'SELECT product_name, product_full_name, price, stock, type, type_options FROM products WHERE id = ?'
                );
                const product = getProductStmt.get(productId);

                if (!product) {
                    throw new Error('Product not found.'); // Will be caught by outer catch block
                }

                if (product.stock < quantity) {
                    throw new Error('Insufficient stock for this product.'); // Will be caught
                }

                // 2. Calculate total amount
                const totalAmount = product.price * quantity;

                // 3. Construct products_ordered JSON string
                const productOrderedDetails = {
                    product_id: productId,
                    name: product.product_full_name || product.product_name,
                    price_at_order: product.price,
                    quantity: quantity,
                    selected_options: selectedOptions || {}, // Store selected options, even if empty
                    category: category // <--- Include the category here!
                };
                const productsOrderedJson = JSON.stringify([productOrderedDetails]);

                // 4. Insert order into the orders table
                const insertOrderStmt = OccasioDB.prepare(
                    'INSERT INTO orders (customer_id, order_date, status, total_amount, products_ordered) VALUES (?, ?, ?, ?, ?)'
                );
                const currentTime = new Date().toISOString();
                const orderInfo = insertOrderStmt.run(customerId, currentTime, 'pending', totalAmount, productsOrderedJson);

                if (orderInfo.changes === 0) {
                    throw new Error('Failed to create order record.');
                }

                // 5. Update product stock
                const updateStockStmt = OccasioDB.prepare(
                    'UPDATE products SET stock = stock - ? WHERE id = ?'
                );
                const stockInfo = updateStockStmt.run(quantity, productId);

                if (stockInfo.changes === 0) {
                    // This could happen if the product was deleted or ID was wrong after initial fetch
                    throw new Error('Failed to update product stock.');
                }

            })(); // Immediately invoke the transaction function

            // If transaction successful, send success response
            // The frontend will then handle the redirect and flash message
            res.status(200).json({ message: 'Your order has been placed successfully!' });

        } catch (error) {
            console.error('Error adding order:', error.message);
            // Send appropriate error message back to frontend
            if (error.message === 'Product not found.') {
                return res.status(404).json({ message: 'The selected product was not found.' });
            } else if (error.message === 'Insufficient stock for this product.') {
                return res.status(400).json({ message: 'Not enough stock available for your requested quantity.' });
            } else {
                return res.status(500).json({ message: 'An unexpected error occurred while placing your order. Please try again.' });
            }
        }
    }
};

module.exports = orderController;
