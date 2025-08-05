const { OccasioDB } = require('./../config/db');

const controller = {

    page: (req, res) => {
        if (req.user) {
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
            } else if (req.user.role === 'manager') {
                res.render('ordersinventory');
            } else if (req.user.role === 'customer') {
                res.render('home');
            }
        } else {
            // If not authenticated, redirect to login page
            req.flash('error', 'Please log in to access this page.');
            res.redirect('/login');
        }
    },

};

module.exports = controller;
