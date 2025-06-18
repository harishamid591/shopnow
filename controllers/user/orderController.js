const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const orderModel = require('../../models/orderSchema');
const productModel = require('../../models/productSchema');
const userModel = require("../../models/userSchema");
const transactionModel = require("../../models/transactionSchema")
const couponModel = require("../../models/couponSchema")
const { creditWallet } = require('../../helper/refundWallet');
const Razorpay = require("razorpay")
const crypto = require("crypto")
const env = require("dotenv").config()
const ejs = require('ejs');
const path = require('path');
const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');


// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
})


const placeOrder = async (req, res) => {
  try {
    const { addressId, paymentMethod, couponCode } = req.body;
    const userId = req.session.user;

    // 1. Find the selected address
    const userAddressDoc = await addressModel.findOne({ userId });
    if (!userAddressDoc) return res.status(404).json({ message: "Address document not found" });

    const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === addressId);
    if (!selectedAddress) return res.status(404).json({ message: "Selected address not found" });

    // 2. Fetch the cart
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });
    if (!userCart || userCart.cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // 3. Calculate total and prepare order items
    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      const quantityOrdered = item.quantity;

      if (!product || product.stock < quantityOrdered) {
        return res.json({ success: false, message: `Product "${product.productName}" does not have enough stock` });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      const totalItemPrice = priceAfterDiscount * quantityOrdered;

      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity: quantityOrdered,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: "pending"
      });
    }

    if (paymentMethod === 'cod' && totalPrice > 1000) {
      return res.status(400).json({
        success: false,
        message: "Cash on Delivery is not allowed for orders above ₹1000"
      });
    }

    for (const item of userCart.cartItems) {
      const product = item.productId;
      product.stock -= item.quantity;
      await product.save();
    }

    // 4. Handle coupon
    let discount = 0;
    let couponName = null;
    let couponApplied = false;

    if (couponCode) {

      const coupon = await couponModel.findOne({
        name: couponCode.trim(),
        $or: [
          { isList: true },
          { isReferralCoupon: true }
        ]
      });
      
      if (!coupon) {
        return res.status(400).json({ success: false, message: "Invalid coupon code" });
      }

      const now = new Date();

      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: "Coupon has expired" });
      }

      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: "Coupon has expired" });
      }
      
      if (coupon.isReferralCoupon) {
        // Referral coupon
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: "This referral coupon is not for your account" });
        }
      
        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: "Referral coupon already used" });
        }
      
        // Apply referral coupon discount (fixed value or % depending on your design)
        discount = (totalPrice * coupon.offerPrice) / 100;  // Since you used `offerPrice: 25` in referral coupon
        couponName = coupon.name;
        couponApplied = true;
      
        // Mark referral coupon as used
        coupon.isUsed = true;
        await coupon.save();
      
      } else {
        // General coupon
        if (totalPrice < coupon.minimumPrice) {
          return res.status(400).json({ success: false, message: `Minimum order value for this coupon is ₹${coupon.minimumPrice}` });
        }
      
        if (coupon.userId.map(id => id.toString()).includes(userId.toString())) {
          return res.status(400).json({ success: false, message: "Coupon already used" });
        }
      
        // Apply general coupon discount
        discount = (totalPrice * coupon.offerPrice) / 100;
        couponName = coupon.name;
        couponApplied = true;
      
        // Mark general coupon as used by this user
        coupon.userId.push(userId);
        await coupon.save();
      }
     
    }

    const shippingCharges = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice - discount + shippingCharges;


    // 5. Create and save the order
    const newOrder = new orderModel({
      userId,
      orderId: uuidv4(),
      orderedItems,
      totalOrderPrice: totalPrice,
      discount,
      deliveryCharge: shippingCharges,
      finalAmount,
      couponName: couponName || null,
      couponApplied,
      address: selectedAddress,
      paymentMethod,
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date()
    });

    await newOrder.save();

    // 6. Clear the cart
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

    const query = {userId}
    const search = req.query.search || ''


    if (req.query.search) {
      query.$or = [
        { orderId: { $regex: new RegExp(search, 'i') } },
        { orderedItems: { $elemMatch: { productName: { $regex: new RegExp(search, 'i') } } } }
      ];
    }

    // Fetch user info for displaying name
    const userData = await userModel.findById(userId);

    // Fetch all orders placed by the user, newest first
    const orders = await orderModel
      .find(query)
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

    // Adjust total and final price
    const cancelledAmount = item.totalProductPrice || (item.price * item.quantity);
    order.totalOrderPrice -= cancelledAmount;
    order.finalAmount -= cancelledAmount;

    // Ensure prices don’t go negative
    if (order.totalOrderPrice < 0) order.totalOrderPrice = 0;
    if (order.finalAmount < 0) order.finalAmount = 0;

    // Restore stock
    const product = await productModel.findById(item.product);
    if (product) {
      product.stock += item.quantity;
      await product.save();
    }

      // Refund to wallet if payment was online or wallet
      if (order.paymentMethod === 'online' || order.paymentMethod === 'wallet') {
      await creditWallet({
        userId,
        amount: item.price * item.quantity,
        orderId: order.orderId,
        productId: item._id.toString(),
        purpose: 'cancellation',
        description: `Refund for cancelled product (${item.productName || 'Item'})`
      });
    }

    // Save updated order
    await order.save();

    res.status(200).json({ success: true, message: "Order item cancelled successfully" });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const retrunProduct = async (req, res) => {
  try {
    const { orderId, itemId, returnReason, returnDescription } = req.body;
    const userId = req.session.user;
    const files = req.files

    const order = await orderModel.findOne({ _id: orderId, userId })
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
    const daysSinceDelivery = Math.floor((currentDate - deliveredDate) / (1000 * 60 * 60 * 24))

    if (item.status !== 'delivered' || daysSinceDelivery > 7) {
      return res.status(400).json({
        success: false,
        message: "Order is not eligible for return",
      })
    }

    let imagePath = [];
    if (files && files.length > 0) {
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

    // Set invoice date if not already set
    if (!order.invoiceDate) {
      order.invoiceDate = new Date();
    }

    // Remove cancelled items
    order.orderedItems = order.orderedItems.filter(item => item.status !== 'cancelled');

    // Adjust finalAmount for returned items
    let returnedAmount = 0;
    order.orderedItems.forEach(item => {
      if (item.status === 'returned') {
        returnedAmount += item.price * item.quantity;
      }
    });

    

    const adjustedFinalAmount = order.finalAmount - returnedAmount;
    order.adjustedFinalAmount = adjustedFinalAmount; // pass to invoice if needed

    // Render EJS to HTML
    const invoiceTemplatePath = path.join(__dirname, '../../views/user/invoice.ejs');
    const html = await ejs.renderFile(invoiceTemplatePath, { order });

    // Launch Puppeteer and generate PDF
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


const createRazorpayOrder = async (req, res) => {
  try {
    const userId = req.session.user;
    const { addressId, couponCode, paymentMethod } = req.body;

    // Fetch cart
    const cart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });
    if (!cart || cart.cartItems.length === 0) {
      return res.json({ success: false, message: 'Cart is empty' });
    }

    // Calculate total amount with effective discount
    let totalAmount = 0;
    for (let item of cart.cartItems) {
      const product = item.productId;
      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      totalAmount += priceAfterDiscount * item.quantity;
    }

    // Store pre-coupon amount for delivery charge check
    let amountBeforeCoupon = totalAmount;

    // Delivery charge: Free if total > 500, else ₹40
    let deliveryCharge = 0;
    if (amountBeforeCoupon <= 500) {
      deliveryCharge = 40;
      totalAmount += deliveryCharge;
    }


    // Coupon logic
    let discountAmount = 0;
    if (couponCode) {
      const coupon = await couponModel.findOne({ name: couponCode.trim(), isList: true });
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }

      const now = new Date();
      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: 'Coupon has expired' });
      }

      if (coupon.isReferralCoupon) {
        // Referral coupon logic
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: 'This referral coupon is not for your account' });
        }

        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: 'Referral coupon already used' });
        }

        // Referral coupon is flat offerPrice value
        discountAmount = (totalAmount * coupon.offerPrice) / 100;
        totalAmount -= discountAmount;

      } else {
        // General coupon logic

        if (coupon.userId.includes(userId)) {
          return res.status(400).json({ success: false, message: 'Coupon already used' });
        }

        if (totalAmount < coupon.minimumPrice) {
          return res.status(400).json({
            success: false,
            message: `Minimum order value for this coupon is ₹${coupon.minimumPrice}`,
          });
        }

        // General coupon: % based discount
        discountAmount = (totalAmount * coupon.offerPrice) / 100;
        totalAmount -= discountAmount;
      }
    }


    // Convert to paise
    const amountInPaise = Math.round(totalAmount * 100);

    // Create Razorpay order
    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: 'rcpt_' + Math.random().toString(36).substring(7),
    };

    const order = await razorpay.orders.create(options);


    const user = await userModel.findById(userId);

    res.json({
      success: true,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: user.phone,
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({ success: false, message: 'Failed to create Razorpay order' });
  }
};

const verifyPayment = async (req, res) => {
  try {
    const userId = req.session.user;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderData } = req.body;

    // Step 1: Verify payment signature
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    // Step 2: Validate address
    const userAddressDoc = await addressModel.findOne({ userId });
    if (!userAddressDoc) return res.status(404).json({ success: false, message: "Address not found" });

    const selectedAddress = userAddressDoc.address.find(addr => addr._id.toString() === orderData.addressId);
    if (!selectedAddress) return res.status(404).json({ success: false, message: "Selected address not found" });

    // Step 3: Get cart and calculate totals
    const userCart = await cartModel.findOne({ userId }).populate({
      path: 'cartItems.productId',
      populate: { path: 'category' }
    });

    if (!userCart || userCart.cartItems.length === 0) {
      return res.status(400).json({ success: false, message: "Cart is empty" });
    }

    // Step 4: Calculate total price using effective discount
    let totalPrice = 0;
    const orderedItems = [];

    for (const item of userCart.cartItems) {
      const product = item.productId;
      const quantityOrdered = item.quantity;

      if (product.stock === null || product.stock < quantityOrdered) {
        return res.json({ success: false, message: `Insufficient stock for ${product.productName}` });
      }

      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;

      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);
      const priceAfterDiscount = product.price - (product.price * effectiveDiscount / 100);
      const totalItemPrice = priceAfterDiscount * quantityOrdered;

      totalPrice += totalItemPrice;

      orderedItems.push({
        product: product._id,
        productName: product.productName,
        productImages: product.productImage,
        quantity: quantityOrdered,
        price: priceAfterDiscount,
        regularPrice: product.price,
        totalProductPrice: totalItemPrice,
        status: "pending"
      });

      product.stock -= quantityOrdered;
      await product.save();
    }

    // Step 4: Apply coupon if valid
    let discount = 0;
    let couponUsed = false;
    let couponName = null;

    if (orderData.couponCode) {
      const coupon = await couponModel.findOne({ name: orderData.couponCode.trim() });
    
      if (!coupon) {
        return res.status(400).json({ success: false, message: 'Invalid coupon code' });
      }
    
      const now = new Date();
      if (coupon.expireOn < now) {
        return res.status(400).json({ success: false, message: 'Coupon has expired' });
      }
    
      // Referral Coupon
      if (coupon.isReferralCoupon) {
        if (coupon.userId.toString() !== userId.toString()) {
          return res.status(400).json({ success: false, message: "This referral coupon is not for your account" });
        }
    
        if (coupon.isUsed) {
          return res.status(400).json({ success: false, message: "Referral coupon already used" });
        }
    
        // Apply 25% discount
        discount = (totalPrice * coupon.offerPrice) / 100;
        couponUsed = true;
        couponName = coupon.name;
    
        // Mark referral coupon as used
        coupon.isUsed = true;
        await coupon.save();
    
      } else {
        // General Coupon
    
        if (coupon.userId.includes(userId)) {
          return res.status(400).json({ success: false, message: 'Coupon already used' });
        }
    
        if (totalPrice < coupon.minimumPrice) {
          return res.status(400).json({
            success: false,
            message: `Minimum order value for this coupon is ₹${coupon.minimumPrice}`,
          });
        }
    
        discount = (totalPrice * coupon.offerPrice) / 100;
        couponUsed = true;
        couponName = coupon.name;
    
        // Mark general coupon as used by adding userId
        coupon.userId.push(userId);
        await coupon.save();
      }
    }
    

    const shippingCharges = totalPrice > 500 ? 0 : 40;
    const finalAmount = totalPrice - discount + shippingCharges;

    // Step 5: Save order
    const newOrder = new orderModel({
      userId,
      orderId: uuidv4(),
      orderedItems,
      totalOrderPrice: totalPrice,
      discount,
      deliveryCharge: shippingCharges,
      finalAmount,
      address: selectedAddress,
      paymentMethod: "online",
      invoiceDate: new Date(),
      status: "pending",
      createdOn: new Date(),
      couponApplied: couponUsed,
      couponName: couponName
    });

    await newOrder.save();

    // Step 6: Save transaction
    const transaction = new transactionModel({
      userId,
      amount: finalAmount,
      transactionType: "debit",
      paymentMethod: "online",
      paymentGateway: "razorpay",
      gatewayTransactionId: razorpay_payment_id,
      status: "completed",
      purpose: "purchase",
      description: `Purchase using Razorpay. Order ID: ${newOrder.orderId}`,
      orders: [{ orderId: newOrder.orderId, amount: finalAmount }]
    });

    await transaction.save();

    // Step 7: Clear cart
    userCart.cartItems = [];
    await userCart.save();

    // Step 8: Return response
    res.status(200).json({
      success: true,
      message: "Payment verified and order placed successfully",
      orderId: newOrder.orderId
    });

  } catch (error) {
    console.error("Payment verification error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};




module.exports = {
  placeOrder,
  getOrders,
  orderDetails,
  cancelOrder,
  retrunProduct,
  cancelReturnRequest,
  generateInvoice,
  createRazorpayOrder,
  verifyPayment,
};
