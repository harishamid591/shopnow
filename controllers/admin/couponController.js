const couponModel = require("../../models/couponSchema")


const getCoupons = async (req, res) => {
    try {
        const findCoupons = await couponModel.find({}).sort({ createdOn: -1 });

        const formattedCoupons = findCoupons.map(coupon => ({
        ...coupon._doc,
        createdOn: formatDate(coupon.createdOn),
        expireOn: formatDate(coupon.expireOn)
        }));

        return res.render('admin-coupons', { coupons: formattedCoupons });
    } catch (error) {
        console.log(error);
        return res.redirect("/pageerror");
    }
};
  
function formatDate(date) {
    const d = new Date(date);
    const day = (`0${d.getDate()}`).slice(-2);
    const month = (`0${d.getMonth() + 1}`).slice(-2);
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
}

const createCoupon = async(req, res) => {
    try {
        const { name, startDate, endDate, offer, minPrice ,maxPrice} = req.body;
    
        const newCoupon = new couponModel({
        name,
        createdOn: new Date(startDate),  // Store as Date object
        expireOn: new Date(endDate),
        offerPrice: offer,
        minimumPrice: minPrice,
        maxPrice
        });
    
        await newCoupon.save();
    
        return res.json({ success: true, message: 'Coupon added successfully' });
    
    } catch (error) {
        console.log(error);
        res.redirect("/pageerror");
    }
};
      

const editCoupon = async (req, res) => {
    try {
        const { id, name, startDate, endDate, offerPrice, minPrice, maxPrice } = req.body;

        if (!id || !name || !startDate || !endDate || !offerPrice || !minPrice || !maxPrice) {
            return res.status(400).send("All fields are required");
        }

        if (new Date(endDate) < new Date(startDate)) {
            return res.status(400).send("End date cannot be before start date");
        }

        const updatedCoupon = await couponModel.findByIdAndUpdate(
            id,
        {
            name,
            createdOn: new Date(startDate),  // Store as Date
            expireOn: new Date(endDate),
            offerPrice: offerPrice,
            minimumPrice: minPrice,
            maxPrice:maxPrice
        },
        { new: true }
        );

        if (!updatedCoupon) {
            return res.status(404).send("Coupon not found");
        }

        return res.json({ success: true, message: 'Coupon updated successfully' });

    } catch (error) {
        console.error("Error updating coupon:", error);
        return res.status(500).send("Internal server error");
    }
};

const deleteCoupon = async(req,res)=>{
    try {
        const couponId = req.params.id;

        await couponModel.deleteOne({_id:couponId});

        res.json({success:true, message:'Coupon deleted successfully'})

    } catch (error) {
        console.error("Error Deleting Coupon",error)
        res.status(500).send({success:false,message:"Internal Server Error"})
    }
}
  
  
module.exports = {
    getCoupons,
    createCoupon,
    editCoupon,
    deleteCoupon
}