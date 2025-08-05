// Import necessary modules
const { OccasioDB } = require('./../config/db'); // Adjust the path if your db.js is located elsewhere.

const homeController = {
    // MODIFIED: This function now fetches the first page of products,
    // optionally filtering by search query and category.
    page: (req, res) => {
        if (req.user) {
            // Logic for admin and manager roles remains the same.
            if (req.user.role === 'admin') {
                try {
                    // Fetch customer data for the dashboard
                    const customerStmt = OccasioDB.prepare("SELECT id, username, address, created_at FROM accounts WHERE role = 'customer'");
                    const customers = customerStmt.all();

                    // Fetch employee data (users with 'manager' role) and their assigned categories
                    // This query joins accounts with employee_categories and groups by employee to get all categories
                    const employeeCategoriesStmt = OccasioDB.prepare(`
                        SELECT
                            a.id,
                            a.username,
                            a.address,
                            GROUP_CONCAT(ec.category_name) AS assigned_categories_json
                        FROM
                            accounts a
                        LEFT JOIN
                            employee_categories ec ON a.id = ec.employee_id
                        WHERE
                            a.role = 'manager'
                        GROUP BY
                            a.id, a.username, a.address
                    `);
                    let employees = employeeCategoriesStmt.all();

                    // Process employees to convert assigned_categories_json string into an array
                    employees = employees.map(employee => ({
                        ...employee,
                        // If assigned_categories_json is null/empty string, default to empty array
                        assignedItems: employee.assigned_categories_json ? employee.assigned_categories_json.split(',') : []
                    }));

                    // Render the dashboard, passing the fetched data
                    res.render('dashboard', {
                        customers: customers,
                        employees: employees
                        // Note: mockItems and mockTransactions are currently client-side in dashboard.ejs.
                        // If these also need to be dynamic, you'd fetch them here and pass them too.
                    });

                } catch (dbError) {
                    console.error("Database query error on dashboard load:", dbError.message);
                    req.flash('error', 'Failed to load dashboard data due to a database error.');
                    res.redirect('/home'); // Redirect to a safe page
                }
            }  else if (req.user.role === 'manager') {
                return res.render('ordersinventory');
            } else if (req.user.role === 'customer') {
                try {
                    const initialLimit = 8;
                    const { search, category } = req.query; // Get filters from query string

                    let queryParams = [];
                    let whereClauses = [];

                    // Base query to select products and their primary image
                    let sql = `
                        SELECT
                            p.id,
                            p.product_name as name,
                            p.price,
                            p.category,
                            p.stock,
                            (SELECT pi.image_data FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as image_data,
                            (SELECT pi.image_mime_type FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as image_mime_type
                        FROM products p
                    `;

                    // Dynamically add WHERE clauses for filtering
                    if (search) {
                        whereClauses.push("p.product_name LIKE ?");
                        queryParams.push(`%${search}%`);
                    }
                    if (category) {
                        whereClauses.push("p.category = ?");
                        queryParams.push(category);
                    }

                    if (whereClauses.length > 0) {
                        sql += ` WHERE ${whereClauses.join(' AND ')}`;
                    }

                    sql += " ORDER BY p.created_at DESC LIMIT ?";
                    queryParams.push(initialLimit);

                    const stmt = OccasioDB.prepare(sql);
                    const initialProducts = stmt.all(...queryParams);

                    const productsWithImages = initialProducts.map(product => {
                        let imageUrl = `https://placehold.co/250x150/eee/ccc?text=No+Image`;
                        if (product.image_data && product.image_mime_type) {
                            const base64Image = Buffer.from(product.image_data).toString('base64');
                            imageUrl = `data:${product.image_mime_type};base64,${base64Image}`;
                        }
                        return { ...product, imageUrl };
                    });

                    // Pass products and current filters to the template
                    res.render('home', {
                        products: productsWithImages,
                        search: search || '',
                        category: category || ''
                    });

                } catch (dbError) {
                    console.error("Database error on home page load:", dbError.message);
                    req.flash('error', 'Could not load products at this time.');
                    res.render('home', { products: [], search: '', category: '' });
                }
            }
        } else {
            req.flash('error', 'Please log in to access this page.');
            res.redirect('/login');
        }
    },

    // MODIFIED: This API endpoint now accepts search and category parameters.
    showProducts: (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 8;
            const { search, category } = req.query;
            const offset = (page - 1) * limit;

            let queryParams = [];
            let whereClauses = [];

            let sql = `
                SELECT
                    p.id,
                    p.product_name,
                    p.price,
                    p.category,
                    p.stock,
                    (SELECT pi.image_data FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as image_data,
                    (SELECT pi.image_mime_type FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order ASC, pi.id ASC LIMIT 1) as image_mime_type
                FROM products p
            `;

            if (search) {
                whereClauses.push("p.product_name LIKE ?");
                queryParams.push(`%${search}%`);
            }
            if (category) {
                whereClauses.push("p.category = ?");
                queryParams.push(category);
            }

            if (whereClauses.length > 0) {
                sql += ` WHERE ${whereClauses.join(' AND ')}`;
            }

            sql += " ORDER BY p.created_at DESC LIMIT ? OFFSET ?";
            queryParams.push(limit, offset);

            const stmt = OccasioDB.prepare(sql);
            const products = stmt.all(...queryParams);

            const productsWithImages = products.map(product => {
                let imageUrl = `https://placehold.co/250x150/eee/ccc?text=No+Image`;
                if (product.image_data && product.image_mime_type) {
                    const base64Image = Buffer.from(product.image_data).toString('base64');
                    imageUrl = `data:${product.image_mime_type};base64,${base64Image}`;
                }
                return {
                    id: product.id,
                    name: product.product_name,
                    price: product.price,
                    category: product.category,
                    stock: product.stock,
                    imageUrl: imageUrl
                };
            });

            res.json({ products: productsWithImages });

        } catch (dbError) {
            console.error("API Error fetching more products:", dbError.message);
            res.status(500).json({ error: 'Failed to fetch products from the server.' });
        }
    },

    getProductDetails: (req, res) => {
        if (!req.isAuthenticated()) {
            req.flash('error', 'You must be logged in to view product details.');
            return res.redirect('/login');
        }
        try {
            const productId = req.params.id;

            // 1. Fetch product details
            const productStmt = OccasioDB.prepare(`
                SELECT
                    id, product_name, product_full_name, description, category, brand, sku, price, stock, type, type_options, features
                FROM products
                WHERE id = ?
            `);
            const product = productStmt.get(productId);

            if (!product) {
                req.flash('error', 'Product not found.');
                return res.redirect('/home'); // Redirect if product not found
            }

            // 2. Fetch all images for the product
            const imagesStmt = OccasioDB.prepare(`
                SELECT id, image_data, image_mime_type, display_order
                FROM product_images
                WHERE product_id = ?
                ORDER BY display_order ASC, id ASC
            `);
            const images = imagesStmt.all(productId);

            const productImages = images.map(img => {
                const base64Image = Buffer.from(img.image_data).toString('base64');
                return {
                    id: img.id,
                    src: `data:${img.image_mime_type};base64,${base64Image}`,
                    alt: product.product_name + ' image' // Generic alt text
                };
            });

            // Parse JSON strings back to arrays/values for frontend
            const parsedProduct = {
                ...product,
                type_options: product.type_options ? JSON.parse(product.type_options) : [],
                features: product.features ? JSON.parse(product.features) : [],
                images: productImages // Add the formatted images array
            };

            res.render('product', { product: parsedProduct });

        } catch (dbError) {
            console.error("Database error fetching product details:", dbError.message);
            req.flash('error', 'Could not load product details at this time.');
            res.redirect('/home');
        }
    }
};

module.exports = homeController;