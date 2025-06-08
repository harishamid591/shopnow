const addressModel = require("../../models/addressSchema");
const cartModel = require("../../models/cartSchema");
const userModel = require("../../models/userSchema");
const walletModel = require("../../models/walletSchema");


// const getCheckoutPage = async (req, res) => {
//     try {
      
//       const userId = req.session.user;
  
//       // Get user addresses
//       const addresses = await addressModel.findOne({ userId: userId }).lean();

//       const user = await userModel.findById(userId)
  
//       // Get cart and populate product details inside cartItems.productId
//       const cart = await cartModel
//         .findOne({ userId: userId })
//         .populate('cartItems.productId')  // populate product details
//         .lean();
  
//       if (!cart) {
//         return res.render('checkout', {
//           userAddresses: addresses ? addresses.address : [],
//           checkoutItems: [],
//           totalItems: 0,
//           totalMRP: 0,
//           totalDiscount: 0,
//           shippingCharges: 0,
//           finalPrice: 0
//         });
//       }

//       const wallet = await walletModel.findOne({userId:userId});

//       let transactions = [];
//       if (wallet) {
//           transactions = wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);
//       }
  
//       // Extract addresses array from addresses doc
//       const userAddresses = addresses ? [...addresses.address].reverse() : [];

//       if(addresses){
//         userAddresses[0].isDefault = true
//       }
     
  
//       // Prepare checkoutItems array with product info + cart info
//       const checkoutItems = cart.cartItems.map(item => {
//         const product = item.productId;
  
//         // Calculate discount price per item, total MRP, total discount
//         const price = product.price;
//         const discount = product.discount || 0;
//         const quantity = item.quantity;
  
//         const discountedPrice = price - (price * discount) / 100;
//         const totalPrice = discountedPrice * quantity;
  
//         return {
//           _id: product._id,
//           name: product.productName,
//           image: product.productImage.length > 0 ? product.productImage[0] : '/images/default.png',
//           quantity,
//           price, // original price per item
//           discount,
//           discountedPrice,
//           totalPrice
//         };
//       });
  
//       // Calculate totals
//       const totalItems = checkoutItems.reduce((acc, item) => acc + item.quantity, 0);
//       const totalMRP = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
//       const totalDiscount = checkoutItems.reduce((acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity, 0);
  
//       // Example shipping charges logic (you can customize)
//       const shippingCharges = totalMRP > 500 ? 0 : 40;
  
//       const finalPrice = totalMRP - totalDiscount + shippingCharges;
  
//       res.render('checkout', {
//         user,
//         userAddresses,
//         checkoutItems,
//         totalItems,
//         totalMRP,
//         totalDiscount,
//         shippingCharges,
//         finalPrice,
//         wallet: wallet || { balance: 0, refundAmount: 0, totalDebited: 0 }
//       });
  
//     } catch (error) {
//       console.error('Error in getCheckoutPage:', error);
//       res.status(500).send('Internal Server Error');
//     }
//   };
  
  const getCheckoutPage = async (req, res) => {
    try {
      const userId = req.session.user;

      // Get user addresses
      const addresses = await addressModel.findOne({ userId: userId }).lean();

      const user = await userModel.findById(userId);

      // 🟡 Populate productId + category also
      const cart = await cartModel
        .findOne({ userId: userId })
        .populate({
          path: 'cartItems.productId',
          populate: {
            path: 'category', // populate category also
          },
        })
        .lean();

      if (!cart) {
        return res.render('checkout', {
          user,
          userAddresses: addresses ? addresses.address : [],
          checkoutItems: [],
          totalItems: 0,
          totalMRP: 0,
          totalDiscount: 0,
          shippingCharges: 0,
          finalPrice: 0,
          wallet: { balance: 0, refundAmount: 0, totalDebited: 0 },
        });
      }

      const wallet = await walletModel.findOne({ userId: userId });

      let transactions = [];
      if (wallet) {
        transactions = wallet.transactions.sort((a, b) => b.createdAt - a.createdAt);
      }

      const userAddresses = addresses ? [...addresses.address].reverse() : [];
      if (addresses) {
        userAddresses[0].isDefault = true;
      }

      // 🟡 Prepare checkoutItems array with effective discount
      const checkoutItems = cart.cartItems.map(item => {
        const product = item.productId;

        const price = product.price;
        const productDiscount = product.discount || 0;
        const categoryDiscount = product.category?.categoryOffer || 0;

        // 🟡 Take maximum discount
        const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

        const quantity = item.quantity;

        const discountedPrice = price - (price * effectiveDiscount) / 100;
        const totalPrice = discountedPrice * quantity;

        return {
          _id: product._id,
          name: product.productName,
          image: product.productImage.length > 0 ? product.productImage[0] : '/images/default.png',
          quantity,
          price,
          discount: effectiveDiscount, // 🟡 use effective discount
          discountedPrice,
          totalPrice,
        };
      });

      // 🟡 Calculate totals
      const totalItems = checkoutItems.reduce((acc, item) => acc + item.quantity, 0);
      const totalMRP = checkoutItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const totalDiscount = checkoutItems.reduce(
        (acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity,
        0
      );

      const shippingCharges = totalMRP - totalDiscount > 500 ? 0 : 40;
      const finalPrice = totalMRP - totalDiscount + shippingCharges;

      res.render('checkout', {
        user,
        userAddresses,
        checkoutItems,
        totalItems,
        totalMRP,
        totalDiscount,
        shippingCharges,
        finalPrice,
        wallet: wallet || { balance: 0, refundAmount: 0, totalDebited: 0 },
      });

    } catch (error) {
      console.error('Error in getCheckoutPage:', error);
      res.status(500).send('Internal Server Error');
    }
  };



  const checkStock = async (req, res) => {
    try {
        const userId = req.session.user;

        const cart = await cartModel.findOne({ userId }).populate('cartItems.productId');

        if (!cart || cart.cartItems.length === 0) {
            return res.json({
                success: false,
                message: 'Cart is empty',
                items: []
            });
        }

        const updatedItems = [];

        for (let item of cart.cartItems) {
            const product = item.productId;

            if (!product) continue;

            let updatedItem = {
                productId: product._id,
                isBlocked: product.isBlocked,
                stockChanged: false
            };

            // Check if product is blocked
            if (product.isBlocked) {
                updatedItems.push(updatedItem);
                continue;
            }

            // Check stock availability
            if (product.stock < item.quantity) {
                updatedItem.stockChanged = true;

                // Update the quantity to match stock (if stock > 0)
                const newQuantity = product.stock > 0 ? product.stock : 0;

                item.quantity = newQuantity;
                item.totalPrice = newQuantity * item.price;
            }

            updatedItems.push(updatedItem);
        }

        // Save any updated cart changes
        await cart.save();

        return res.json({
            success: true,
            items: updatedItems
        });

    } catch (error) {
        console.error('Error in checkStock:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};

module.exports ={
    getCheckoutPage,
    checkStock
}