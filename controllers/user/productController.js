const productModel = require('../../models/productSchema');


const productDetails = async(req,res)=>{
    try {

        const productId = req.params.id;

        const product = await productModel.findOne({_id:productId});

        res.render('product-details',{
            product
        });

    } catch (error) {
        
    }
}

module.exports = {
    productDetails
}