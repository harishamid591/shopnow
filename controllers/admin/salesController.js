const Order = require('../../models/orderSchema'); // Adjust path as needed
const PDFDocument = require('pdfkit');
const productModel = require('../../models/productSchema');
const categoryModel = require("../../models/categorySchema")


// const generatePDF = require('../utils/generatePDF'); // Replace with your actual PDF logic
// const generateExcel = require('../utils/generateExcel'); // Replace with your actual Excel logic


// const finalAmount = order.finalAmount - (order.deliveryCharge || 0);
// const actualDiscount = orderRegularPrice - finalAmount;
// const couponDiscount = order.couponApplied
//   ? (order.totalPrice - order.finalAmount)
//   : 0;


const loadSalesPage = async (req, res) => {
  try {
    const { reportType, startDate, endDate, format } = req.query;
    const now = new Date();
    let query = { status: 'delivered' };

    // Time-based filters
    switch (reportType) {
      case 'daily':
        query.createdOn = {
          $gte: new Date(now.setHours(0, 0, 0, 0)),
          $lt: new Date(now.setHours(23, 59, 59, 999))
        };
        break;

      case 'weekly':
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        query.createdOn = {
          $gte: new Date(weekAgo.setHours(0, 0, 0, 0)),
          $lt: new Date(now.setHours(23, 59, 59, 999))
        };
        break;

      case 'monthly':
        query.createdOn = {
          $gte: new Date(now.getFullYear(), now.getMonth(), 1),
          $lt: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
        };
        break;

      case 'custom':
        if (startDate && endDate) {
          query.createdOn = {
            $gte: new Date(startDate),
            $lt: new Date(new Date(endDate).setHours(23, 59, 59, 999))
          };
        }
        break;
    }

    // Fetch all matching delivered orders
    const orders = await Order.find(query)
      .populate('orderedItems.product')
      .sort({ createdOn: 1 });


    let totalRegularPrice = 0;
    let totalFinalAmount = 0;

    const sales = orders.map(order => {
      const orderRegularPrice = order.orderedItems.reduce((sum, item) => {
        return sum + (item.regularPrice * item.quantity);
      }, 0);

      const finalAmount = order.finalAmount - (order.deliveryCharge || 0);
      const actualDiscount = orderRegularPrice - finalAmount;
      const couponDiscount = order.couponApplied
        ? (order.totalOrderPrice - order.finalAmount)
        : 0;

      totalRegularPrice += orderRegularPrice;
      totalFinalAmount += finalAmount;

      return {
        orderId: order.orderId,
        amount: finalAmount,
        discount: order.discount || 0,
        coupon: couponDiscount,
        lessPrice: actualDiscount,
        date: order.createdOn,
        items: order.orderedItems.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          regularPrice: item.regularPrice,
          finalPrice: item.price
        }))
      };
    });

    // Summary
    const salesData = {
      sales,
      totalSales: totalFinalAmount,
      orderCount: sales.length,
      discounts: sales.reduce((sum, sale) => sum + sale.discount, 0),
      coupons: sales.reduce((sum, sale) => sum + sale.coupon, 0),
      lessPrices: totalRegularPrice - totalFinalAmount
    };

    // Handle format (PDF/Excel)
    if (format === 'pdf') return generatePDF(res, salesData);
    if (format === 'excel') return generateExcel(res, salesData);

    // Render page
    res.render('sales-report', { salesData });

  } catch (error) {
    console.error('Error in loadSalesPage:', error);
    res.status(500).render('admin/pageerror', {
      message: 'Error loading sales report',
      error: error.message
    });
  }
};

// const generatePDF = async (res, salesData) => {
//   const doc = new PDFDocument();
  
 
//   res.setHeader("Content-Type", "application/pdf");
//   res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

//   doc.pipe(res);

//   // Add content to PDF
//   doc.fontSize(20).text("Sales Report", { align: "center" });
//   doc.moveDown();

//   // Add summary
//   doc.fontSize(14).text("Summary");
//   doc.fontSize(12)
//       .text(`Total Sales: Rs. ${salesData.totalSales.toLocaleString()}`)
//       .text(`Total Orders: ${salesData.orderCount}`)
//       .text(`Total Coupons: Rs. ${salesData.discounts.toLocaleString()}`) 
//       .text(`Total Discounts: Rs. ${salesData.lessPrices.toLocaleString()}`); 

//   doc.moveDown();

  
//   doc.fontSize(14).text("Detailed Sales");
//   let y = doc.y + 20;

//   // Table headers
//   const headers = ["Date", "Order ID", "Amount", "Discounts", "Coupons"];
//   let x = 50;
//   headers.forEach((header) => {
//       doc.text(header, x, y);
//       x += 100;
//   });

//   // Table rows
//   y += 20;
//   salesData.sales.forEach((sale) => {
//       x = 50;
//       doc.text(new Date(sale.date).toLocaleDateString(), x, y);
//       x += 100;
      
//       // Extract only the last 12 characters of orderId
//       const shortOrderId = sale.orderId.toString().slice(-12);
//       doc.text(shortOrderId, x, y);
//       x += 100;

//       doc.text(`Rs. ${sale.amount.toLocaleString()}`, x, y);
//       x += 100;
//       doc.text(`Rs. ${sale.lessPrice.toLocaleString()}`, x, y); 
//       x += 100;
//       doc.text(`Rs. ${sale.discount.toLocaleString()}`, x, y); 
//       y += 20;
//   });

//   doc.end();
// }

const generatePDF = async (res, salesData) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: "A4" });

  // Set response headers
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

  doc.pipe(res);

  // Helper to format currency properly
  const formatCurrency = (amount) => {
    return `Rs. ${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // ===== Logo (Shopnow with color) =====
  doc
    .fontSize(26)
    .font("Helvetica-Bold")
    .fillColor("#E67E22") // Orange
    .text("Shop", { continued: true });

  doc
    .fillColor("#27AE60") // Green
    .text("now", { align: "left" });

  // Divider line
  doc
    .moveTo(40, doc.y + 5)
    .lineTo(555, doc.y + 5)
    .strokeColor("#ccc")
    .lineWidth(1)
    .stroke();

  doc.moveDown(2);

  // ===== Title =====
  doc
    .fontSize(20)
    .font("Helvetica-Bold")
    .fillColor("#000")
    .text("Sales Report", { align: "center" });
  doc.moveDown();

  // ===== Summary =====
  doc.fontSize(14).font("Helvetica-Bold").text("Summary");
  doc.fontSize(12).font("Helvetica")
    .text(`Total Sales     : ${formatCurrency(salesData.totalSales)}`)
    .text(`Total Orders    : ${salesData.orderCount}`)
    .text(`Total Coupons   : ${formatCurrency(salesData.discounts)}`)
    .text(`Total Discounts : ${formatCurrency(salesData.lessPrices)}`);

  doc.moveDown();

  // ===== Detailed Sales =====
  doc.fontSize(14).font("Helvetica-Bold").text("Detailed Sales");
  const headers = ["Date", "Order ID", "Amount", "Discount", "Coupon"];
  let y = doc.y + 10;
  let xStart = 50;

  // Table header
  doc.rect(xStart - 5, y - 5, 500, 20).fill("#eeeeee").stroke();
  headers.forEach((header, i) => {
    doc.fillColor("#000").font("Helvetica-Bold").text(header, xStart + i * 100, y, { width: 100 });
  });
  y += 25;

  // Table rows
  doc.font("Helvetica").fontSize(11);
  salesData.sales.forEach((sale) => {
    if (y > 750) {
      doc.addPage();
      y = 50;
    }

    const row = [
      new Date(sale.date).toLocaleDateString("en-IN"),
      sale.orderId.toString().slice(-12),
      formatCurrency(sale.amount),
      formatCurrency(sale.lessPrice),
      formatCurrency(sale.discount)
    ];

    row.forEach((text, i) => {
      doc.text(text, xStart + i * 100, y, { width: 100 });
    });

    y += 20;
  });

  // Footer
  doc.fontSize(10).fillColor("gray")
    .text(`Generated on: ${new Date().toLocaleString("en-IN")}`, 50, 800, { align: "left" });

  doc.end();
};

const loadOfferManagement = async(req, res) => {
  const productOffers = [
    {
      productName: "Casual Shirt",
      discountPercent: 20,
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-10"),
      isActive: true,
    },
    {
      productName: "Running Shoes",
      discountPercent: 10,
      startDate: new Date("2025-05-25"),
      endDate: new Date("2025-06-05"),
      isActive: false,
    }
  ];

  const categoryOffers = [
    {
      categoryName: "Electronics",
      discountPercent: 15,
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-30"),
      isActive: true,
    },
    {
      categoryName: "Men’s Wear",
      discountPercent: 30,
      startDate: new Date("2025-06-01"),
      endDate: new Date("2025-06-10"),
      isActive: true,
    }
  ];

  // res.render('admin/offer-management', {
  //   productOffers,
  //   categoryOffers,
  //   products: await productModel.find({}, 'name'),      // to populate the product dropdown
  //   categories: await categoryModel.find({}, 'name'),   // to populate the category dropdown
  // });
  


  res.render("offer-management", {
    productOffers,
    categoryOffers,
    products: await productModel.find({}, 'productName'),      // to populate the product dropdown
    categories: await categoryModel.find({}, 'categoryName'),
  });
};



module.exports = {
  loadSalesPage,
  loadOfferManagement
};
