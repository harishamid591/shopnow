const wishlistModel = require('../../models/wishlistSchema');
const userModel = require('../../models/userSchema');

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect('/login'); // Redirect to login if user not authenticated
    }

    const user = await userModel.findById(userId); // e.g., { name: "Haris", email: "..." }
    const currentPage = 'wishlist';

    // Find the wishlist and populate products + categories
    const wishlistDoc = await wishlistModel.findOne({ userId }).populate({
      path: 'product',
      populate: {
        path: 'category', // To access categoryOffer
      },
    });

    const wishlist = wishlistDoc
      ? wishlistDoc.product.map((product) => {
          // Calculate effective discount
          const productDiscount = product.discount || 0;
          const categoryOffer = product.category?.categoryOffer || 0;
          const effectiveDiscount = Math.max(productDiscount, categoryOffer);

          return {
            _id: product._id,
            name: product.productName,
            price: product.price,
            stock: product.stock,
            discount: product.discount,
            effectiveDiscount: effectiveDiscount, // Add this field
            image: product.productImage[0] || '/images/default.jpg',
          };
        })
      : [];

    res.render('wishlist', { user, wishlist, currentPage });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).render('error', { message: 'Failed to load wishlist.' });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user; // or req.user._id depending on your auth middleware
    const { productId } = req.body;

    if (!userId) {
      return res.status(401).json({ status: false, message: 'Not authenticated' });
    }

    let wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      // Create new wishlist
      wishlist = new wishlistModel({
        userId,
        product: [productId],
      });
    } else {
      // Check if product already exists
      if (wishlist.product.includes(productId)) {
        return res.json({ status: false, message: 'Product is already in wishlist' });
      }

      // Add product to existing wishlist
      wishlist.product.push(productId);
    }

    await wishlist.save();
    res.json({ status: true, message: 'Product added to wishlist' });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

const removeProduct = async (req, res) => {
  try {
    const productId = req.query.productId;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ status: false, message: 'Not authenticated' });
    }

    const wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      return res.status(404).json({ status: false, message: 'Wishlist not found' });
    }

    const index = wishlist.product.indexOf(productId);
    if (index === -1) {
      return res.status(404).json({ status: false, message: 'Product not found in wishlist' });
    }

    wishlist.product.splice(index, 1); // remove the product
    await wishlist.save();

    res.json({ status: true, message: 'Product removed from wishlist' });
  } catch (error) {
    console.error('Error removing product from wishlist:', error);
    res.status(500).json({ status: false, message: 'Server error' });
  }
};

module.exports = {
  getWishlist,
  addToWishlist,
  removeProduct,
};
