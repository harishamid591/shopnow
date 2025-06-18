const cartModel = require("../../models/cartSchema");
const categoryModel = require("../../models/categorySchema");
const productModel = require("../../models/productSchema");
const userModel = require("../../models/userSchema");



const getCartPage = async (req, res) => {
  try {
    const userId = req.session.user;

    const userData = await userModel.findById(userId);

    // Get the cart for the logged-in user and populate product details
    const cart = await cartModel.findOne({ userId })
    .populate({
      path: 'cartItems.productId',
      populate: {
        path: 'category', // populate category also
      },
    });


    if (!cart || cart.cartItems.length === 0) {
      // If no cart or empty cart
      return res.render('cart', {
        cartItems: [],
        totalItems: 0,
        totalMRP: 0,
        totalDiscount: 0,
        shippingCharges: 0,
        finalPrice: 0,
        user: userData
      });
    }



    const cartItems = cart.cartItems
    .filter(item => item.productId) // skip if product was deleted
    .map(item => {
      const product = item.productId;
      const price = product.price;
      const productDiscount = product.discount || 0;
      const categoryDiscount = product.category?.categoryOffer || 0;

      // 🟡 Take maximum of categoryOffer and product.discount
      const effectiveDiscount = Math.max(productDiscount, categoryDiscount);

      const quantity = item.quantity;
      
      const discountedPrice = price - (price * effectiveDiscount) / 100;
      const totalPrice = discountedPrice * quantity;

      return {
        _id: product._id,
        image: product.productImage[0],
        name: product.productName,
        quantity,
        price,
        discount: effectiveDiscount, // Send the effective discount to frontend
        discountedPrice,
        totalPrice,
        stock: product.stock
      };
    });

    // Calculate totals
    const totalItems = cartItems.reduce((acc, item) => acc + item.quantity, 0);
    const totalMRP = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const totalDiscount = cartItems.reduce((acc, item) => acc + ((item.price * item.discount) / 100) * item.quantity, 0);

    const priceAfterDiscount = totalMRP - totalDiscount


    const shippingCharges = priceAfterDiscount > 500 ? 0 : 40;

    const finalPrice = priceAfterDiscount + shippingCharges;

    res.render('cart', {
      cartItems,
      totalItems,
      totalMRP,
      totalDiscount,
      shippingCharges,
      finalPrice,
      user: userData
    });

  } catch (error) {
    console.log('Error loading cart page:', error);
    res.status(500).send('Internal Server Error');
  }
};

const addToCart = async (req, res) => {
  try {

    const userId = req.session.user;
    const { productId, quantity } = req.body;

    const product = await productModel.findById(productId);

    if (!product) {
      return res.json({ success: false, message: 'Product not found' });
    }

    if (product.stock <= 0) {
      return res.json({ success: false, message: 'Product is out of stock' });
    }


    const price = product.price;
    const qty = parseInt(quantity) || 1;
    const totalPrice = price * qty;


    let cart = await cartModel.findOne({ userId });


    // If no cart exists, create a new one
    if (!cart) {
      const newCart = new cartModel({
        userId,
        cartItems: [{
          productId,
          quantity: qty,
          price,
          totalPrice
        }]
      });

      await newCart.save();
      return res.json({ success: true, message: 'Cart created and product added' });
    }



    // Cart exists - check if product already in cart
    const existingItemIndex = cart.cartItems.findIndex(
      item => item.productId.toString() === productId
    );


    if (existingItemIndex > -1) {
      const existingItem = cart.cartItems[existingItemIndex];

      // New quantity
      const newQty = existingItem.quantity + qty;

      if (newQty > 5) {
        return res.json({ success: false, message: 'Maximum 5 items allowed per product' });
      }

      if (newQty > product.stock) {
        return res.json({ success: false, message: 'Not enough stock available' });
      }

      // Update quantity and total price
      existingItem.quantity = newQty;
      existingItem.totalPrice = existingItem.quantity * price;

    } else {
      // New product in cart
      if (qty > 5) {
        return res.json({ success: false, message: 'Maximum 5 items allowed per product' });
      }

      cart.cartItems.push({
        productId,
        quantity: qty,
        price,
        totalPrice
      });
    }

   await cart.save();

    return res.json({ success: true, message: 'Product added to cart' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
};

const changeQuantity = async (req, res) => {
  try {
    const { action, productId } = req.body;
    const userId = req.session.user;


    // Fetch user cart
    const cart = await cartModel.findOne({ userId });


    if (!cart) {
      return res.status(404).json({ status: false, message: 'Cart not found' });
    }

    // Find the item in the cart
    const itemIndex = cart.cartItems.findIndex(
      item => item.productId.toString() === productId
    );


    if (itemIndex === -1) {
      return res.status(404).json({ status: false, message: 'Product not found in cart' });
    }

    const item = cart.cartItems[itemIndex];


    const product = await productModel.findById(productId);



    if (!product) {
      return res.status(404).json({ status: false, message: 'Product no longer exists' });
    }

    if(product.stock === 0){
      cart.cartItems.splice(itemIndex,1);
      await cart.save();
      return res.json({status:true,message:'Sorry! Product removed from cart due to zero stock'})
    }

    if (action === 'increase') {
      if (item.quantity >= 5) {
        return res.json({ status: false, message: 'Maximum 5 quantity per user' });
      }

      if (item.quantity >= product.stock) {
        return res.json({ status: false, message: 'Stock limit exceeded' });
      }

      item.quantity += 1;

    } else if (action === 'decrease') {
      if (item.quantity > 1) {
        item.quantity -= 1;
      } else {
        // Remove the item if quantity becomes 0
        cart.cartItems.splice(itemIndex, 1);
      }
    } else {
      return res.status(400).json({ status: false, message: 'Invalid action' });
    }

    // Update total price for the item
    if (cart.cartItems[itemIndex]) {
      cart.cartItems[itemIndex].totalPrice = cart.cartItems[itemIndex].quantity * product.price;
    }

    await cart.save();
    return res.json({ status: true, message: 'Cart updated successfully' });

  } catch (error) {
    console.error("changeQuantity Error:", error);
    return res.status(500).json({ status: false, message: 'Server error while updating cart' });
  }
};

const deleteItem = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.session.user;

    // Find the user's cart
    const cart = await cartModel.findOne({ userId });

    if (!cart) {
      return res.status(404).json({ success: false, message: 'Cart not found' });
    }

    // Check if the product exists in the cart
    const itemIndex = cart.cartItems.findIndex(
      item => item.productId.toString() === productId
    );

    if (itemIndex === -1) {
      return res.status(404).json({ success: false, message: 'Product not found in cart' });
    }

    // Remove the item from cart
    cart.cartItems.splice(itemIndex, 1);

    // Save the updated cart
    await cart.save();

    return res.status(200).json({ success: true, message: 'Product removed from cart' });

  } catch (error) {
    console.error("deleteItem Error:", error);
    return res.status(500).json({ success: false, message: 'Server error while deleting item' });
  }
};



module.exports = {
    getCartPage,
    addToCart,
    changeQuantity,
    deleteItem
}