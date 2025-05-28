const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");


const getCheckoutPage = async (req, res) => {
    try {
      const userId = req.session.user;
  
      // Get user addresses
      const addresses = await addressModel.findOne({ userId: userId }).lean();
  
      // Get cart and populate product details inside cartItems.productId
      const cart = await cartModel
        .findOne({ userId: userId })
        .populate('cartItems.productId')  // populate product details
        .lean();
  
      if (!cart) {
        return res.render('checkout', {
          userAddresses: addresses ? addresses.address : [],
          checkoutItems: [],
          totalItems: 0,
          totalMRP: 0,
          totalDiscount: 0,
          shippingCharges: 0,
          finalPrice: 0
        });
      }
  
      // Extract addresses array from addresses doc
      const userAddresses = addresses ? [...addresses.address].reverse() : [];

      if(addresses){
        userAddresses[0].isDefault = true
      }
     
  
      // Prepare checkoutItems array with product info + cart info
      const checkoutItems = cart.cartItems.map(item => {
        const product = item.productId;
  
        // Calculate discount price per item, total MRP, total discount
        const price = product.price;
        const discount = product.discount || 0;
        const quantity = item.quantity;
  
        const discountedPrice = price - (price * discount) / 100;
        const totalPrice = discountedPrice * quantity;
  
        return {
          _id: product._id,
          name: product.productName,
          image: product.productImage.length > 0 ? product.productImage[0] : '/images/default.png',
          quantity,
          price, // original price per item
          discount,
          discountedPrice,
          totalPrice
        };
      });
  
      // Calculate totals
      const totalItems = checkoutItems.reduce((acc, item) => acc + item.quantity, 0);
      const totalMRP = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const totalDiscount = checkoutItems.reduce((acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity, 0);
  
      // Example shipping charges logic (you can customize)
      const shippingCharges = totalMRP > 500 ? 0 : 40;
  
      const finalPrice = totalMRP - totalDiscount + shippingCharges;
  
      res.render('checkout', {
        userAddresses,
        checkoutItems,
        totalItems,
        totalMRP,
        totalDiscount,
        shippingCharges,
        finalPrice
      });
  
    } catch (error) {
      console.error('Error in getCheckoutPage:', error);
      res.status(500).send('Internal Server Error');
    }
  };
  

module.exports ={
    getCheckoutPage
}