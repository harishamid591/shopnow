const couponModel = require("../../models/couponSchema");
const userModel = require('../../models/userSchema');

// const loadCoupon = async (req, res) => {
//     try {
//       const userId = req.session.user;  
//       const user = await userModel.findOne({_id:userId})
//       const coupons = await couponModel.find({ isList: true }).sort({ expireOn: 1 });
  
//       res.render('coupons', {
//         user,
//         currentPage: 'coupons',
//         coupons
//       });
//     } catch (error) {
//       console.error("Error loading coupons:", error);
//       res.status(500).render('errorPage', { message: 'Failed to load coupons', error });
//     }
//   };


// const loadCoupon = async (req, res) => {
//   try {
//     const userId = req.session.user;
//     const user = await userModel.findOne({ _id: userId });

//     let coupons = await couponModel.find({ isList: true }).sort({ expireOn: 1 });

//     // Format dates
//     coupons = coupons.map(coupon => {
//       const formattedDate = coupon.expireOn.toLocaleDateString('en-GB'); // DD/MM/YYYY

//       return {
//         ...coupon._doc,
//         formattedExpiry: formattedDate.replace(/\//g, '-') // Convert to DD-MM-YYYY
//       };
//     });


//     res.render('coupons', {
//       user,
//       currentPage: 'coupons',
//       coupons
//     });
//   } catch (error) {
//     console.error("Error loading coupons:", error);
//     res.status(500).render('errorPage', { message: 'Failed to load coupons', error });
//   }
// };

// const loadCoupon = async (req, res) => {
//   try {
//     const userId = req.session.user;

//     const user = await userModel.findById(userId);

//     let coupons = await couponModel.find({
//       isList: true,
//       userId: { $ne: userId } // Exclude if user has already used
//     }).sort({ expireOn: 1 });

//     // Format expiry date
//     coupons = coupons.map(coupon => {
//       const formattedDate = coupon.expireOn.toLocaleDateString('en-GB').replace(/\//g, '-');
//       return {
//         ...coupon._doc,
//         formattedExpiry: formattedDate
//       };
//     });

//     res.render('coupons', {
//       user,
//       currentPage: 'coupons',
//       coupons
//     });

//   } catch (error) {
//     console.error("Error loading coupons:", error);
//     res.status(500).render('errorPage', { message: 'Failed to load coupons', error });
//   }
// };


const loadCoupon = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await userModel.findById(userId);

    // General Coupons: visible to all but not referral coupons
    let generalCoupons = await couponModel.find({
      isList: true,
      isReferralCoupon: { $ne: true },
      userId: { $ne: userId }
    }).sort({ expireOn: 1 });

    // Referral Coupons: given specifically to this user
    let referralCoupons = await couponModel.find({
      userId: userId,
      isReferralCoupon: true,
      isUsed:false
    }).sort({ expireOn: 1 });

    // Format both coupon types
    const formatCoupons = (coupons) =>
      coupons.map(coupon => ({
        ...coupon._doc,
        formattedExpiry: coupon.expireOn.toLocaleDateString('en-GB').replace(/\//g, '-')
      }));

    generalCoupons = formatCoupons(generalCoupons);
    referralCoupons = formatCoupons(referralCoupons);

    res.render('coupons', {
      user,
      currentPage: 'coupons',
      generalCoupons,
      referralCoupons
    });

  } catch (error) {
    console.error("Error loading coupons:", error);
    res.status(500).render('errorPage', { message: 'Failed to load coupons', error });
  }
};




const applyCoupon = async (req, res) => {
  try {
    const { couponCode, orderTotal } = req.body;
    const userId = req.session.user;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Please login to apply a coupon.' });
    }

    const coupon = await couponModel.findOne({ name: couponCode, isList: true });

    if (!coupon) {
      return res.status(404).json({ success: false, message: 'Invalid coupon code.' });
    }

    // Check if coupon is expired
    if (new Date(coupon.expireOn) < new Date()) {
      return res.status(400).json({ success: false, message: 'Coupon has expired.' });
    }

    if(coupon.isReferralCoupon){

      if (coupon.isUsed) {
        return res.status(400).json({ success: false, message: 'You have already used this referral coupon.' });
      }
    }else if (coupon.userId.map(id => id.toString()).includes(userId.toString())) {
      return res.status(400).json({ success: false, message: 'You have already used this coupon.' });
    } 

    // Check if order total meets minimum requirement
    if(!coupon.isReferralCoupon){
      if (orderTotal < coupon.minimumPrice) {
        return res.status(400).json({
          success: false,
          message: `Minimum purchase should be ₹${coupon.minimumPrice} to apply this coupon.`,
        });
      }
    }
   
    // If everything is valid, return coupon discount
    return res.status(200).json({
      success: true,
      coupon: {
        code: coupon.name,
        offerPrice: coupon.offerPrice
      },
      discount: coupon.offerPrice
    });

  } catch (error) {
    console.error("Error applying coupon:", error);
    res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
  }
};

// const applyCoupon = async (req, res) => {
//   try {
//     const { couponCode, orderTotal } = req.body;
//     const userId = req.session.user;

//     if (!userId) {
//       return res.status(401).json({ success: false, message: 'Please login to apply a coupon.' });
//     }

//     const coupon = await couponModel.findOne({ name: couponCode, isList: true });

//     if (!coupon) {
//       return res.status(404).json({ success: false, message: 'Invalid coupon code.' });
//     }

//     // Check if coupon is expired
//     if (new Date(coupon.expireOn) < new Date()) {
//       return res.status(400).json({ success: false, message: 'Coupon has expired.' });
//     }

//     // Check if user has already used the coupon
//     if (coupon.userId.includes(userId)) {
//       return res.status(400).json({ success: false, message: 'You have already used this coupon.' });
//     }

//     // Check if order total meets minimum requirement
//     if (orderTotal < coupon.minimumPrice) {
//       return res.status(400).json({
//         success: false,
//         message: `Minimum purchase should be ₹${coupon.minimumPrice} to apply this coupon.`,
//       });
//     }

//     // If everything is valid, return coupon discount
//     return res.status(200).json({
//       success: true,
//       coupon: {
//         code: coupon.name,
//         offerPrice: coupon.offerPrice
//       },
//       discount: coupon.offerPrice
//     });

//   } catch (error) {
//     console.error("Error applying coupon:", error);
//     res.status(500).json({ success: false, message: 'Something went wrong. Try again.' });
//   }
// };

module.exports = {
    loadCoupon,
    applyCoupon
}