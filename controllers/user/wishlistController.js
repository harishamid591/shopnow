const wishlistModel = require('../../models/wishlistSchema');
const productModel = require('../../models/productSchema');
const userModel = require('../../models/userSchema');

// const getWishlist = async(req,res)=>{
//     try {
//         const user = { name: "Haris" }; // Replace with actual user data from session
//         const currentPage = "wishlist";
      
//         const wishlist = [
//           {
//             _id: "prod1",
//             name: "Noise ColorFit Icon 2 Smartwatch",
//             price: 1799,
//             image: "/images/products/watch1.jpg"
//           },
//           {
//             _id: "prod2",
//             name: "boAt Rockerz 450 Bluetooth Headphones",
//             price: 1499,
//             image: "/images/products/headphones1.jpg"
//           },
//           {
//             _id: "prod3",
//             name: "Samsung Galaxy M14 5G (6GB RAM, 128GB)",
//             price: 12999,
//             image: "/images/products/phone1.jpg"
//           }
//         ];
      
//         res.render("wishlist", { user, wishlist, currentPage });
//     } catch (error) {
        
//     }
// }

const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user;

    if (!userId) {
      return res.redirect('/login'); // Redirect to login if user not authenticated
    }

    const user = await userModel.findById(userId); // e.g., { name: "Haris", email: "..." }
    const currentPage = "wishlist";

    // Find the wishlist and populate products
    const wishlistDoc = await wishlistModel.findOne({ userId }).populate('product');

    const wishlist = wishlistDoc
      ? wishlistDoc.product.map(product => ({
          _id: product._id,
          name: product.productName,
          price: product.price,
          stock: product.stock,
          discount:product.discount,
          image: product.productImage[0] || "/images/default.jpg" // Use first image or fallback
        }))
      : [];

    res.render("wishlist", { user, wishlist, currentPage });
  } catch (error) {
    console.error("Error loading wishlist:", error);
    res.status(500).render("error", { message: "Failed to load wishlist." });
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user; // or req.user._id depending on your auth middleware
    const { productId } = req.body;

    if (!userId) {
      return res.status(401).json({ status: false, message: "Not authenticated" });
    }

    let wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      // Create new wishlist
      wishlist = new wishlistModel({
        userId,
        product: [productId]
      });
    } else {
      // Check if product already exists
      if (wishlist.product.includes(productId)) {
        return res.json({ status: false, message: "Product is already in wishlist" });
      }

      // Add product to existing wishlist
      wishlist.product.push(productId);
    }

    await wishlist.save();
    res.json({ status: true, message: "Product added to wishlist" });

  } catch (error) {
    console.error("Error adding to wishlist:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

const removeProduct = async (req, res) => {
  try {
    const productId = req.query.productId;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ status: false, message: "Not authenticated" });
    }

    const wishlist = await wishlistModel.findOne({ userId });

    if (!wishlist) {
      return res.status(404).json({ status: false, message: "Wishlist not found" });
    }

    const index = wishlist.product.indexOf(productId);
    if (index === -1) {
      return res.status(404).json({ status: false, message: "Product not found in wishlist" });
    }

    wishlist.product.splice(index, 1); // remove the product
    await wishlist.save();

    res.json({ status: true, message: "Product removed from wishlist" });

  } catch (error) {
    console.error("Error removing product from wishlist:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
};

module.exports = {
    getWishlist,
    addToWishlist,
    removeProduct
}
