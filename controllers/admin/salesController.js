const Order = require('../../models/orderSchema'); // Adjust path as needed
const PDFDocument = require('pdfkit');
const productModel = require('../../models/productSchema');
const categoryModel = require("../../models/categorySchema")
const ExcelJS = require('exceljs');


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
      // Exclude returned products for correct sales reporting
      const nonReturnedItems = order.orderedItems.filter(item => item.status !== 'returned');

      const orderRegularPrice = nonReturnedItems.reduce((sum, item) => {
        return sum + (item.regularPrice * item.quantity);
      }, 0);

      const nonReturnedAmount = nonReturnedItems.reduce((sum, item) => {
        return sum + (item.price * item.quantity);
      }, 0);

      const finalAmount = nonReturnedAmount;

      const actualDiscount = orderRegularPrice - finalAmount;

      const couponDiscount = order.couponApplied
        ? (order.totalOrderPrice - order.finalAmount)
        : 0;

      totalRegularPrice += orderRegularPrice;
      totalFinalAmount += finalAmount;

      return {
        orderId: order.orderId,
        address: order.address,
        amount: finalAmount, // updated amount excluding returned products
        discount: order.discount || 0,
        coupon: couponDiscount,
        lessPrice: actualDiscount,
        date: order.createdOn,
        paymentMethod: order.paymentMethod,
        items: order.orderedItems.map(item => ({
          name: item.productName,
          quantity: item.quantity,
          regularPrice: item.regularPrice,
          finalPrice: item.price,
          status: item.status // optional: useful for debugging
        }))
      };
    });

    // Summary
    const salesData = {
      sales,
      totalSales: totalFinalAmount, // correct total sales
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



const generatePDF = async (res, salesData) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ margin: 40, size: "A4" });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=sales-report.pdf");

  doc.pipe(res);

  const formatCurrency = (amount) => {
    return `₹${Number(amount).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  };

  // === Logo ===
  doc.fontSize(26).font("Helvetica-Bold").fillColor("#E67E22").text("Shop", { continued: true });
  doc.fillColor("#27AE60").text("now", { align: "left" });

  doc.moveTo(40, doc.y + 5).lineTo(555, doc.y + 5).strokeColor("#ccc").lineWidth(1).stroke();
  doc.moveDown(2);

  // === Title ===
  doc.fontSize(20).font("Helvetica-Bold").fillColor("#000").text("Sales Report", { align: "center" });
  doc.moveDown();

  // === Summary ===
  doc.fontSize(14).font("Helvetica-Bold").text("Summary");
  doc.fontSize(12).font("Helvetica")
    .text(`Total Sales     : ${formatCurrency(salesData.totalSales)}`)
    .text(`Total Orders    : ${salesData.orderCount}`)
    .text(`Total Coupons   : ${formatCurrency(salesData.discounts)}`)
    .text(`Total Discounts : ${formatCurrency(salesData.lessPrices)}`);
  doc.moveDown();

  // === Detailed Sales ===
  doc.fontSize(14).font("Helvetica-Bold").text("Detailed Sales");

  // Adjusted column widths to fit within 515pt width
  const colWidths = [75, 80, 100, 80, 90, 90]; // Total = 515
  const headers = ["Date", "Order ID", "Name", "Amount", "Discount", "Coupon"];
  let xStart = 40;
  let y = doc.y + 10;

  // Table header background
  doc.rect(xStart, y - 5, 515, 20).fill("#eeeeee").stroke();
  doc.font("Helvetica-Bold").fillColor("#000");

  // Header text
  headers.forEach((header, i) => {
    doc.text(header, xStart, y, { width: colWidths[i], align: 'left' });
    xStart += colWidths[i];
  });

  y += 25;
  xStart = 40;

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
      sale.address.name,
      formatCurrency(sale.amount),
      formatCurrency(sale.lessPrice),
      formatCurrency(sale.discount)
    ];

    let rowX = xStart;
    row.forEach((text, i) => {
      doc.text(text, rowX, y, { width: colWidths[i], align: 'left' });
      rowX += colWidths[i];
    });

    y += 20;
  });

  // Footer
  doc.fontSize(10).fillColor("gray")
    .text(`Generated on: ${new Date().toLocaleString("en-IN")}`, 50, 800, { align: "left" });

  doc.end();
};


const generateExcel = async (res, salesData) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  const bold = { bold: true };
  const formatCurrency = (num) => parseFloat(num.toFixed(2));

  // === Column Definitions with "Name" Added ===
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 15 },
    { header: 'Order ID', key: 'orderId', width: 25 },
    { header: 'Name', key: 'name', width: 20 },
    { header: 'Amount (₹)', key: 'amount', width: 15 },
    { header: 'Discounts (₹)', key: 'lessPrice', width: 15 },
    { header: 'Coupons (₹)', key: 'discount', width: 15 }
  ];

  // === Summary Section ===
  worksheet.addRow([]);
  const summaryTitleRow = worksheet.addRow(['Summary']);
  summaryTitleRow.font = bold;

  worksheet.addRow(['Total Sales', '', '', formatCurrency(salesData.totalSales)]);
  worksheet.addRow(['Total Orders', '', '', salesData.orderCount]);
  worksheet.addRow(['Total Discounts', '', '', formatCurrency(salesData.discounts)]);
  worksheet.addRow(['Total Less Prices', '', '', formatCurrency(salesData.lessPrices)]);
  worksheet.addRow([]);

  // === Detailed Sales Section ===
  const detailTitleRow = worksheet.addRow(['Detailed Sales']);
  detailTitleRow.font = bold;

  worksheet.addRow([]); // spacer
  const headerRow = worksheet.addRow(worksheet.columns.map(col => col.header));
  headerRow.font = bold;

  salesData.sales.forEach(sale => {
    worksheet.addRow({
      date: new Date(sale.date).toLocaleDateString('en-IN'),
      orderId: sale.orderId.toString(),
      name: sale.address?.name || 'N/A',
      amount: formatCurrency(sale.amount),
      lessPrice: formatCurrency(sale.lessPrice),
      discount: formatCurrency(sale.discount)
    });
  });

  // === Optional: Borders ===
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber >= headerRow.number) {
      row.eachCell(cell => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' }
        };
      });
    }
  });

  // === Send Excel File ===
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
  await workbook.xlsx.write(res);
};


module.exports = {
  loadSalesPage,
};
