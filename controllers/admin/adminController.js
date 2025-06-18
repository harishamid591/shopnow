const userModel = require("../../models/userSchema")
const Product = require("../../models/productSchema")
const Order = require("../../models/orderSchema")
const Category = require("../../models/categorySchema")
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

// const loadDashboard = async (req, res) => {
//     if (req.session.admin) {
//         try {
//             // Total products
//             const productCount = await productModel.countDocuments();

//             // Total users (not blocked)
//             const userCount = await userModel.countDocuments({ isBlocked: false });

//             // Total orders
//             const orderCount = await orderModel.countDocuments();

//             // Total revenue (delivered orders only)
//             const deliveredOrders = await orderModel.aggregate([
//                 { $match: { status: 'delivered' } },
//                 { $group: { _id: null, totalRevenue: { $sum: "$finalAmount" } } }
//             ]);
//             const totalRevenue = deliveredOrders.length > 0 ? deliveredOrders[0].totalRevenue : 0;

//             // Sales chart (monthly revenue for last 6 months)
//             const salesDataAgg = await orderModel.aggregate([
//                 { $match: { status: 'delivered' } },
//                 {
//                     $group: {
//                         _id: { $month: "$createdOn" },
//                         monthlyRevenue: { $sum: "$finalAmount" }
//                     }
//                 },
//                 { $sort: { "_id": 1 } }
//             ]);

//             const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
//             const salesLabels = [];
//             const salesData = [];

//             salesDataAgg.forEach(item => {
//                 salesLabels.push(monthLabels[item._id - 1]);
//                 salesData.push(item.monthlyRevenue);
//             });

//             // Order status chart
//             const orderStatusAgg = await orderModel.aggregate([
//                 {
//                     $group: {
//                         _id: "$status",
//                         count: { $sum: 1 }
//                     }
//                 }
//             ]);

//             const orderStatusLabels = [];
//             const orderStatusData = [];

//             orderStatusAgg.forEach(item => {
//                 // Capitalize first letter
//                 orderStatusLabels.push(item._id.charAt(0).toUpperCase() + item._id.slice(1));
//                 orderStatusData.push(item.count);
//             });

//             // Recent orders (latest 5 orders)
//             const recentOrdersDocs = await orderModel.find()
//                 .sort({ createdOn: -1 })
//                 .limit(5)
//                 .populate('userId', 'name');

//             const recentOrders = recentOrdersDocs.map(order => ({
//                 orderId: order.orderId,
//                 customerName: order.userId?.name || 'Unknown',
//                 finalAmount: order.finalAmount,
//                 status: order.status
//             }));

//             // Prepare dashboardData object
//             const dashboardData = {
//                 productCount,
//                 userCount,
//                 orderCount,
//                 totalRevenue,
//                 salesLabels,
//                 salesData,
//                 orderStatusLabels,
//                 orderStatusData,
//                 recentOrders
//             };

//             // Render dashboard page with data
//             res.render('dashboard', { dashboardData });

//         } catch (err) {
//             console.error(err);
//             res.status(500).send('Server Error');
//         }
//     } else {
//         return res.redirect('/admin/login');
//     }
// };


const getSalesChartData = async (filter) => {
    let matchStage = { status: "delivered" };
    let groupStage;
    let sortStage;
    let dateLimit = new Date();

    if (filter === 'last30') {
        dateLimit.setDate(dateLimit.getDate() - 30);
        matchStage.createdOn = { $gte: dateLimit };

        groupStage = {
            _id: {
                year: { $year: "$createdOn" },
                month: { $month: "$createdOn" },
                day: { $dayOfMonth: "$createdOn" }
            },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };

    } else if (filter === 'yearly') {
        groupStage = {
            _id: { year: { $year: "$createdOn" } },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1 };

    } else {
        // monthly
        groupStage = {
            _id: { year: { $year: "$createdOn" }, month: { $month: "$createdOn" } },
            totalSales: { $sum: "$finalAmount" }
        };

        sortStage = { "_id.year": 1, "_id.month": 1 };
    }

    const sales = await Order.aggregate([
        { $match: matchStage },
        { $group: groupStage },
        { $sort: sortStage }
    ]);

    const labels = sales.map(s => {
        if (filter === 'yearly') return s._id.year.toString();
        if (filter === 'last30') return `${s._id.day}/${s._id.month}`;
        return `${s._id.month}/${s._id.year}`;
    });

    const data = sales.map(s => s.totalSales);

    return { labels, data };
};

const loadDashboard = async (req, res) => {
    try {
        const filter = req.query.filter || 'monthly';

        // Sales chart data
        const salesData = await getSalesChartData(filter);

        // Top 10 Products
        const topProducts = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { status: "delivered" } },
            { $group: {
                _id: "$orderedItems.product",
                totalQuantity: { $sum: "$orderedItems.quantity" }
            }},
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            { $lookup: {
                from: "products",
                localField: "_id",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $project: {
                productName: "$productDetails.productName",
                totalQuantity: 1
            }}
        ]);

        // Top 10 Categories
        const topCategories = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { status: "delivered" } },
            { $lookup: {
                from: "products",
                localField: "orderedItems.product",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $group: {
                _id: "$productDetails.category",
                totalQuantity: { $sum: "$orderedItems.quantity" }
            }},
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 },
            { $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "categoryDetails"
            }},
            { $unwind: "$categoryDetails" },
            { $project: {
                categoryName: "$categoryDetails.categoryName",
                totalQuantity: 1
            }}
        ]);

        // Top 10 Brands
        const topBrands = await Order.aggregate([
            { $unwind: "$orderedItems" },
            { $match: { status: "delivered" } },
            { $lookup: {
                from: "products",
                localField: "orderedItems.product",
                foreignField: "_id",
                as: "productDetails"
            }},
            { $unwind: "$productDetails" },
            { $group: {
                _id: "$productDetails.brand",
                totalQuantity: { $sum: "$orderedItems.quantity" }
            }},
            { $sort: { totalQuantity: -1 } },
            { $limit: 10 }
        ]);

        res.render("dashboard", {
            salesChartLabels: salesData.labels,
            salesChartData: salesData.data,
            topProducts,
            topCategories,
            topBrands
        });

    } catch (err) {
        console.error("Error loading dashboard:", err);
        res.status(500).send("Internal Server Error");
    }
};


// const ledgerBook = async (req, res) => {
//     try {
//       // Fetch all relevant orders
//       const orders = await Order.find({
//         status: { $in: ['delivered', 'cancelled', 'returned'] }
//       })
//       .populate('orderedItems.product')
//       .sort({ createdOn: -1 });

//         // Filter out COD cancelled orders
//       const filteredOrders = orders.filter(order => {
//          return !(order.paymentMethod === 'cod' && order.status === 'cancelled');
//       });
  
//       // Prepare ledger data
//       const ledgerData = filteredOrders.map(order => {
//         let incomeAmount = 0;
//         let refundAmount = 0;
  
//         order.orderedItems.forEach(item => {
//           const itemTotal = item.price * item.quantity;
  
//           if (item.status === 'returned') {
//             refundAmount += itemTotal;
//           } else {
//             incomeAmount += itemTotal;
//           }
//         });
  
//         // Final ledger amount logic:
//         // - If full order cancelled → negative full order
//         // - If returned → show reduced income, refund separately
//         // - Delivered → normal income
  
//         let amount = 0;
  
//         if (order.status === 'cancelled') {
//           amount = -order.finalAmount;
//         } else {
//           amount = incomeAmount; // only the income part
//         }
  
//         return {
//           orderId: order.orderId,
//           createdOn: order.createdOn,
//           paymentMethod: order.paymentMethod,
//           status: order.status,
//           finalAmount: order.finalAmount,
//           incomeAmount: incomeAmount,
//           refundAmount: refundAmount ? -refundAmount : 0, // show refund as negative
//           amount: amount // income part
//         };
//       });
  
//       res.render('ledgerBook', {
//         ledgerData
//       });
  
//     } catch (err) {
//       console.error('Ledger Book error:', err);
//       res.status(500).send('Server Error');
//     }
//   };


  const ledgerBook = async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = 8;
      const skip = (page - 1) * limit;
  
      // Fetch all relevant orders (filtered and sorted)
      const allOrders = await Order.find({
        status: { $in: ['delivered', 'cancelled', 'returned'] }
      })
        .populate('orderedItems.product')
        .sort({ createdOn: -1 });
  
      // Filter out COD cancelled orders
      const filteredOrders = allOrders.filter(order => {
        return !(order.paymentMethod === 'cod' && order.status === 'cancelled');
      });
  
      const totalRecords = filteredOrders.length;
      const totalPages = Math.ceil(totalRecords / limit);
  
      // Slice only required records for this page
      const paginatedOrders = filteredOrders.slice(skip, skip + limit);
  
      // Prepare ledger data
      const ledgerData = paginatedOrders.map(order => {
        let incomeAmount = 0;
        let refundAmount = 0;
  
        order.orderedItems.forEach(item => {
          const itemTotal = item.price * item.quantity;
  
          if (item.status === 'returned') {
            refundAmount += itemTotal;
          } else {
            incomeAmount += itemTotal;
          }
        });
  
        let amount = 0;
        if (order.status === 'cancelled') {
          amount = -order.finalAmount;
        } else {
          amount = incomeAmount;
        }
  
        return {
          orderId: order.orderId,
          createdOn: order.createdOn,
          paymentMethod: order.paymentMethod,
          status: order.status,
          finalAmount: order.finalAmount,
          incomeAmount,
          refundAmount: refundAmount ? -refundAmount : 0,
          amount
        };
      });
  
      res.render('ledgerBook', {
        ledgerData,
        currentPage: page,
        totalPages
      });
  
    } catch (err) {
      console.error('Ledger Book error:', err);
      res.status(500).send('Server Error');
    }
  };
  

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
    logout,
    ledgerBook
}