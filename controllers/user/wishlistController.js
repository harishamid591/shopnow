

const getWishlist = async(req,res)=>{
    try {
        const user = { name: "Haris" }; // Replace with actual user data from session
        const currentPage = "wishlist";
      
        const wishlist = [
          {
            _id: "prod1",
            name: "Noise ColorFit Icon 2 Smartwatch",
            price: 1799,
            image: "/images/products/watch1.jpg"
          },
          {
            _id: "prod2",
            name: "boAt Rockerz 450 Bluetooth Headphones",
            price: 1499,
            image: "/images/products/headphones1.jpg"
          },
          {
            _id: "prod3",
            name: "Samsung Galaxy M14 5G (6GB RAM, 128GB)",
            price: 12999,
            image: "/images/products/phone1.jpg"
          }
        ];
      
        res.render("wishlist", { user, wishlist, currentPage });
    } catch (error) {
        
    }
}

module.exports = {
    getWishlist
}
