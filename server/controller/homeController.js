// Import necessary modules
const { OccasioDB } = require('./../config/db'); // Adjust the path if your db.js is located elsewhere.

const homeController = {
    // MODIFIED: This function now fetches the first page of products,
    // optionally filtering by search query and category.
    page: (req, res) => {
        if (req.user) {
            // Logic for admin and manager roles remains the same.
            if (req.user.role === 'admin') {
                return res.render('dashboard', { /* ... your admin data ... */ });
            } else if (req.user.role === 'manager') {
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
    }
};

module.exports = homeController;