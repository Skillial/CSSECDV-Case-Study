const { OccasioDB } = require('./../config/db');
const { auditLogger } = require('./../middleware/auditLogger')

const orderController = {
    addOrder: async (req, res) => {
        const { productId, quantity, selectedOptions, category } = req.body;
        const customerId = req.user.id;
        const username = req.user.username;
        const ip_address = req.ip;

        if (!productId || !quantity || quantity <= 0) {
            auditLogger({
                eventType: 'Input Validation',
                userId: customerId,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: `User failed to place order. Reason: Invalid product ID or quantity provided.`
            });
            return res.status(400).json({ message: 'Invalid product or quantity provided.' });
        }
        if (!category || typeof category !== 'string' || category.trim() === '') {
            auditLogger({
                eventType: 'Input Validation',
                userId: customerId,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: `User failed to place order for product ID ${productId}. Reason: Category is required.`
            });
            return res.status(400).json({ message: 'Product category is required.' });
        }

        try {
            let productNameForLog = `ID ${productId}`;
            OccasioDB.transaction(() => {
                const getProductStmt = OccasioDB.prepare('SELECT product_name, product_full_name, price, stock, type, type_options FROM products WHERE id = ?');
                const product = getProductStmt.get(productId);

                if (product) {
                    productNameForLog = product.product_name;
                }

                if (!product) {
                    throw new Error('Product not found.');
                }
                if (product.stock < quantity) {
                    throw new Error('Insufficient stock for this product.');
                }

                const totalAmount = product.price * quantity;
                const productOrderedDetails = {
                    product_id: productId,
                    name: product.product_full_name || product.product_name,
                    price_at_order: product.price,
                    quantity: quantity,
                    selected_options: selectedOptions || {},
                    category: category
                };
                const productsOrderedJson = JSON.stringify([productOrderedDetails]);

                const insertOrderStmt = OccasioDB.prepare('INSERT INTO orders (customer_id, order_date, status, total_amount, products_ordered) VALUES (?, ?, ?, ?, ?)');
                const currentTime = new Date().toISOString();
                const orderInfo = insertOrderStmt.run(customerId, currentTime, 'pending', totalAmount, productsOrderedJson);

                if (orderInfo.changes === 0) {
                    throw new Error('Failed to create order record.');
                }

                const updateStockStmt = OccasioDB.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');
                const stockInfo = updateStockStmt.run(quantity, productId);

                if (stockInfo.changes === 0) {
                    throw new Error('Failed to update product stock.');
                }
            })();

            auditLogger({
                eventType: 'Order Management',
                userId: customerId,
                username: username,
                ip_address: ip_address,
                status: 'Success',
                description: `User successfully placed an order for product '${productNameForLog}' (Quantity: ${quantity}).`
            });
            res.status(200).json({ message: 'Your order has been placed successfully!' });

        } catch (error) {
            let logDescription = `User failed to place an order for product ID ${productId}. Reason: ${error.message}`;
            let responseMessage = 'An unexpected error occurred while placing your order. Please try again.';
            let statusCode = 500;

            if (error.message === 'Product not found.') {
                statusCode = 404;
                responseMessage = 'The selected product was not found.';
            } else if (error.message === 'Insufficient stock for this product.') {
                statusCode = 400;
                responseMessage = 'Not enough stock available for your requested quantity.';
            }

            auditLogger({
                eventType: 'Order Management',
                userId: customerId,
                username: username,
                ip_address: ip_address,
                status: 'Failure',
                description: logDescription
            });
            console.error('Error adding order:', error.message);
            return res.status(statusCode).json({ message: responseMessage });
        }
    },

    getTransactions: async (req, res) => {
        try {
            const selectOrdersStmt = OccasioDB.prepare('SELECT * FROM orders');
            const allOrders = selectOrdersStmt.all();

            const selectCustomersStmt = OccasioDB.prepare('SELECT id, username FROM accounts WHERE role = \'customer\'');
            const customers = selectCustomersStmt.all();
            const customerMap = new Map(customers.map(c => [c.id, c.username]));

            const transactions = [];

            for (const order of allOrders) {
                let productsOrdered;
                try {
                    productsOrdered = JSON.parse(order.products_ordered);
                } catch (e) {
                    console.error(`Error parsing products_ordered for order ID ${order.id}:`, e);
                    continue;
                }

                const customerName = customerMap.get(order.customer_id) || 'Unknown Customer';

                for (const productDetail of productsOrdered) {
                    transactions.push({
                        id: order.id,
                        customerName: customerName,
                        productName: productDetail.name,
                        category: productDetail.category || 'N/A',
                        quantity: productDetail.quantity,
                        price: productDetail.price_at_order,
                        date: order.order_date,
                        status: order.status
                    });
                }
            }

            res.status(200).json(transactions);

        } catch (error) {
            auditLogger({
                eventType: 'Access Control',
                userId: req.user.id,
                username: req.user.username,
                ip_address: req.ip,
                status: 'Failure',
                description: `Admin failed to fetch transaction records. Reason: ${error.message}`
            });
            console.error('Error fetching transaction records:', error.message);
            res.status(500).json({ message: 'Failed to fetch transaction records.' });
        }
    }
};

module.exports = orderController;
