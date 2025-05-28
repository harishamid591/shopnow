const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const orderModel = require('../../models/orderSchema');
const productModel = require('../../models/productSchema');
const userModel = require("../../models/userSchema");
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');

const placeOrder = async (req, res) => {
    try {
        const { addressId, paymentMethod } = req.body;
        const userId = req.session.user;

        // 1. Find the selected address from the address array
        const userAddressDoc = await addressModel.findOne({ userId });
        if (!userAddressDoc) return res.status(404).json({ message: "Address document not found" });

        const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === addressId);
        if (!selectedAddress) return res.status(404).json({ message: "Selected address not found" });

        // 2. Fetch the cart and populate product data
        const userCart = await cartModel.findOne({ userId }).populate('cartItems.productId');
        if (!userCart || userCart.cartItems.length === 0) {
            return res.status(400).json({ message: "Cart is empty" });
        }

        // 3. Prepare order items and calculate totals
        let totalPrice = 0;
        const orderedItems = [];

        for (const item of userCart.cartItems) {
            const product = item.productId;
            const quantityOrdered = item.quantity;

            if (product.stock === null || product.stock < quantityOrdered) {
                return res.status(400).json({ message: `Product "${product.productName}" does not have enough stock` });
            }

            const priceAfterDiscount = product.price - (product.price * product.discount / 100);
            const totalItemPrice = priceAfterDiscount * quantityOrdered;

            totalPrice += totalItemPrice;

            // Add to order
            orderedItems.push({
                product: product._id,
                productName: product.productName,
                productImages: product.productImage,
                quantity: quantityOrdered,
                price: priceAfterDiscount,
                regularPrice: product.price,
                totalProductPrice:totalItemPrice,
                status: "pending"
            });

            // Update stock
            product.stock -= quantityOrdered;
            await product.save();
        }

        const shippingCharges = totalPrice > 500 ? 0 : 40;
        const discount = 0; // Add coupon logic if needed
        const finalAmount = totalPrice - discount + shippingCharges;

        // 4. Create and save the order
        const newOrder = new orderModel({
            userId,
            orderId: uuidv4(),
            orderedItems,
            totalOrderPrice:totalPrice,
            discount,
            deliveryCharge: shippingCharges,
            finalAmount,
            address: selectedAddress,
            paymentMethod,
            invoiceDate: new Date(),
            status: "pending",
            createdOn: new Date()
        });

        await newOrder.save();

        // 5. Clear the cart
        userCart.cartItems = [];
        await userCart.save();

        res.status(201).json({ success: true, message: "Order placed successfully", orderId: newOrder.orderId });

    } catch (error) {
        console.error("Error placing order:", error);
        res.status(500).json({ message: "Internal server error" });
    }
};


const getOrders = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) {
        return res.redirect('/login');
      }
  
      // Fetch user info for displaying name
      const userData = await userModel.findById(userId);
  
      // Fetch all orders placed by the user, newest first
      const orders = await orderModel
        .find({ userId })
        .sort({ createdOn: -1 }); 

      res.render('order', {
        user: { name: userData?.name || "User" },
        orders,
        currentPage: "orders",
      });
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).send("Something went wrong while fetching your orders.");
    }
  };


  const orderDetails = async (req, res) => {
    try {
      const userId = req.session.user;
      if (!userId) return res.redirect('/login');
  
      const orderId = req.params.id;
      const productId = req.query.productId; // Important: Get specific product ID from query
  
      // Find the order by _id and userId
      const order = await orderModel.findOne({ _id: orderId, userId });

  
      if (!order) {
        return res.status(404).send("Order not found.");
      }
  
      // Find the specific product item from the orderedItems array
      const productItem = order.orderedItems.find(item => item._id.toString() === productId);
  
      if (!productItem) {
        return res.status(404).send("Product not found in this order.");
      }
  
      // Optional: populate the product data if needed from productModel
      // const productData = await productModel.findById(productId);
  
      // Get user data (optional for displaying name, etc.)
      const user = await userModel.findById(userId);
  
      res.render('order-details', {
        order,
        productItem, // Pass the matched product item for details and tracking
        user: { name: user?.name || "User" },
        currentPage: 'orders'
      });
  
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).send("Internal server error while fetching order details.");
    }
  };
  

  const cancelOrder = async (req, res) => {
    try {
      const { orderId, itemId, reason } = req.body;
      const userId = req.session.user;
  
      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }
  
      // Find the order belonging to the user
      const order = await orderModel.findOne({ _id: orderId, userId });
  
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
  
      // Find the item within the orderedItems array
      const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
      if (itemIndex === -1) {
        return res.status(404).json({ message: "Ordered item not found" });
      }
  
      const item = order.orderedItems[itemIndex];
  
      // If already cancelled
      if (item.status === "cancelled") {
        return res.status(400).json({ message: "This item is already cancelled" });
      }
  
      // Update item status to cancelled
      order.orderedItems[itemIndex].status = "cancelled";
      order.orderedItems[itemIndex].cancelReason = reason;
      order.orderedItems[itemIndex].cancelledAt = new Date();
  
      // Restore stock
      const product = await productModel.findById(item.product);
      if (product) {
        product.stock += item.quantity;
        await product.save();
      }
  
      // Save updated order
      await order.save();
  
      res.status(200).json({ success: true, message: "Order item cancelled successfully" });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  };

  const retrunProduct = async(req,res)=>{
    try {
      const {orderId, itemId, returnReason, returnDescription} = req.body;
      const userId = req.session.user;
      const files = req.files

      const order = await orderModel.findOne({_id:orderId, userId})
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" })
      }

    

      const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);

      if (itemIndex === -1) {
        return res.status(404).json({ message: "Ordered item not found" });
      }

      const item = order.orderedItems[itemIndex];


      const deliveredDate = item.deliveredOn
      const currentDate = new Date();
      const daysSinceDelivery = Math.floor((currentDate - deliveredDate)/(1000 * 60 * 60 * 24))

      if(item.status !== 'delivered' || daysSinceDelivery > 7){
        return res.status(400).json({
          success: false,
          message: "Order is not eligible for return",
        })
      }

      let imagePath = [];
      if(files && files.length > 0){
        imagePath = files.map((file) => `uploads/returnImages/${file.filename}`);
      }

      item.status = 'return_requested'
      item.returnReason = returnReason
      item.returnDescription = returnDescription
      item.returnImages = imagePath
      item.requestStatus = "pending"

      item.updatedOn = new Date()

          // Set overall order status to return_requested
    order.status = 'return_requested'

       await order.save()

      res.json({
        success: true,
        message: "Return request submitted successfully",
      })

    } catch (error) {
      console.error("Error in requestReturn:", error)
      res.status(500).json({
        success: false,
        message: "Internal server error",
      })
    }
  }


  const cancelReturnRequest = async (req, res) => {
    try {
      const { orderId, itemId } = req.body;
      const userId = req.session.user;
  
      const order = await orderModel.findOne({ _id: orderId, userId });
      if (!order) {
        return res.status(404).json({ success: false, message: "Order not found" });
      }
  
      const itemIndex = order.orderedItems.findIndex(item => item._id.toString() === itemId);
      if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: "Ordered item not found" });
      }
  
      const item = order.orderedItems[itemIndex];
  
      if (item.status !== 'return_requested') {
        return res.status(400).json({ success: false, message: "No return request found for this item" });
      }
  
      // Revert the item status
      item.status = 'delivered';
      item.returnReason = undefined;
      item.returnDescription = undefined;
      item.returnImages = [];
      item.requestStatus = undefined;
      item.updatedOn = new Date();
  
      // If no other items have return_requested, revert overall order status
      const hasOtherReturnRequests = order.orderedItems.some(
        (it, idx) => idx !== itemIndex && it.status === 'return_requested'
      );
  
      if (!hasOtherReturnRequests) {
        order.status = 'delivered';
      }
  
      await order.save();
  
      res.json({ success: true, message: "Return request cancelled successfully" });
  
    } catch (error) {
      console.error("Error in cancelReturnRequest:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  };

  const generateInvoice = async (req, res) => {
    try {
      const orderId = req.params.id;
      const order = await orderModel.findById(orderId).lean();
  
      if (!order) {
        return res.status(404).send('Order not found');
      }
  
      // If invoiceDate not set, set it to now (optional)
      if (!order.invoiceDate) {
        order.invoiceDate = new Date();
      }
  
      order.orderedItems = order.orderedItems.filter(item => item.status !== 'cancelled');


      // Render EJS to HTML
      const invoiceTemplatePath = path.join(__dirname, '../../views/user/invoice.ejs');
      const html = await ejs.renderFile(invoiceTemplatePath, { order });
  
      // Launch Puppeteer and generate PDF buffer
      const browser = await puppeteer.launch();
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
  
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
      });
  
      await browser.close();
  
      // Send PDF to client
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=invoice_${order.orderId}.pdf`,
        'Content-Length': pdfBuffer.length
      });
  
      return res.send(pdfBuffer);
  
    } catch (error) {
      console.error('Invoice generation error:', error);
      return res.status(500).send('Failed to generate invoice');
    }
  };

module.exports = {
    placeOrder,
    getOrders,
    orderDetails,
    cancelOrder,
    retrunProduct,
    cancelReturnRequest,
    generateInvoice
};
