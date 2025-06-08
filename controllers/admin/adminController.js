const userModel = require("../../models/userSchema")
const productModel = require("../../models/productSchema")
const orderModel = require("../../models/orderSchema")
const bcrypt = require('bcrypt')


const pageerror = (req,res)=>{
    res.render('admin-error')
}


const loadLogin = async (req, res) => {

    if (req.session.admin) {
        return res.redirect('/admin/dashboard')
    }
    res.render('adminLogin')

}

const adminLogin = async (req, res) => {
    
    try {

        const { email, password } = req.body;

        const findAdmin = await userModel.findOne({ email, isAdmin:true });
    
        if (!findAdmin) {
            return res.render('adminLogin', { msg: `Invalid Credentials` });
        }
    
        const checkPassword = await bcrypt.compare(password, findAdmin.password);
    
        if (!checkPassword) {
            return res.render('adminLogin', { msg: `Invalid Credentials` })
        }
    
        req.session.admin = findAdmin._id;
    
        return res.redirect('/admin/dashboard');

    } catch (error) {
        console.log('admin login error',error);
        return res.redirect('/pageeroor');
    }
}

const loadDashboard = async (req, res) => {
    if (req.session.admin) {
        try {
            // Total products
            const productCount = await productModel.countDocuments();

            // Total users (not blocked)
            const userCount = await userModel.countDocuments({ isBlocked: false });

            // Total orders
            const orderCount = await orderModel.countDocuments();

            // Total revenue (delivered orders only)
            const deliveredOrders = await orderModel.aggregate([
                { $match: { status: 'delivered' } },
                { $group: { _id: null, totalRevenue: { $sum: "$finalAmount" } } }
            ]);
            const totalRevenue = deliveredOrders.length > 0 ? deliveredOrders[0].totalRevenue : 0;

            // Sales chart (monthly revenue for last 6 months)
            const salesDataAgg = await orderModel.aggregate([
                { $match: { status: 'delivered' } },
                {
                    $group: {
                        _id: { $month: "$createdOn" },
                        monthlyRevenue: { $sum: "$finalAmount" }
                    }
                },
                { $sort: { "_id": 1 } }
            ]);

            const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const salesLabels = [];
            const salesData = [];

            salesDataAgg.forEach(item => {
                salesLabels.push(monthLabels[item._id - 1]);
                salesData.push(item.monthlyRevenue);
            });

            // Order status chart
            const orderStatusAgg = await orderModel.aggregate([
                {
                    $group: {
                        _id: "$status",
                        count: { $sum: 1 }
                    }
                }
            ]);

            const orderStatusLabels = [];
            const orderStatusData = [];

            orderStatusAgg.forEach(item => {
                // Capitalize first letter
                orderStatusLabels.push(item._id.charAt(0).toUpperCase() + item._id.slice(1));
                orderStatusData.push(item.count);
            });

            // Recent orders (latest 5 orders)
            const recentOrdersDocs = await orderModel.find()
                .sort({ createdOn: -1 })
                .limit(5)
                .populate('userId', 'name');

            const recentOrders = recentOrdersDocs.map(order => ({
                orderId: order.orderId,
                customerName: order.userId?.name || 'Unknown',
                finalAmount: order.finalAmount,
                status: order.status
            }));

            // Prepare dashboardData object
            const dashboardData = {
                productCount,
                userCount,
                orderCount,
                totalRevenue,
                salesLabels,
                salesData,
                orderStatusLabels,
                orderStatusData,
                recentOrders
            };

            // Render dashboard page with data
            res.render('dashboard', { dashboardData });

        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    } else {
        return res.redirect('/admin/login');
    }
};

// const loadDashboard = async (req,res)=>{

//     if(req.session.admin){
//         try {
//             const dashboardData = {
//                 productCount: 120,
//                 userCount: 450,
//                 orderCount: 320,
//                 totalRevenue: 1500000,
//                 salesLabels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
//                 salesData: [200000, 250000, 180000, 300000, 280000, 350000],
//                 orderStatusLabels: ['Delivered', 'Pending', 'Cancelled'],
//                 orderStatusData: [240, 50, 30],
//                 recentOrders: [
//                     { orderId: 'ORD123456789', customerName: 'John Doe', finalAmount: 4500, status: 'delivered' },
//                     { orderId: 'ORD987654321', customerName: 'Jane Smith', finalAmount: 3200, status: 'pending' },
//                     { orderId: 'ORD555666777', customerName: 'Ali Khan', finalAmount: 6800, status: 'cancelled' }
//                 ]
//             };
    
//             res.render('dashboard', { dashboardData });
//         } catch (err) {
//             console.error(err);
//             res.status(500).send('Server Error');
//         }
//     }else{
//         return res.redirect('/admin/login');
//     }
// }

const logout = (req,res)=>{

    try {
        req.session.destroy((err)=>{
            if(err){
                return res.redirect('/admin/login')
            }
            return res.redirect('/admin/login')
        })
    } catch (error) {
        console.log('error occur while logout',error)
        return res.redirect('/admin/pageerror')
    }
    
}

module.exports = {
    loadLogin,
    adminLogin,
    loadDashboard,
    pageerror,
    logout
}