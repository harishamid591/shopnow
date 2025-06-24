const userModel = require("../../models/userSchema");
const categoryModel = require("../../models/categorySchema");
const productModel = require("../../models/productSchema");
const wishlistModel = require("../../models/wishlistSchema");
const couponModel = require("../../models/couponSchema");
const bcrypt = require('bcrypt')
const env = require('dotenv').config();
const nodemailer = require('nodemailer')


const pageNotFound = async (req, res) => {
    try {
        return res.render('page-404')
    } catch (error) {
        return redirect('/pageNotFound');
    }
}

const loadLogin = (req, res) => {
    try {
        res.render('login');
    } catch (error) {
        console.log('login page not found');
        res.status(500).send('server error')
    }
}

const loadHome = async (req, res) => {
    try {
      const userId = req.session.user;
  
      // Get all listed categories
      const categories = await categoryModel.find({ isListed: true });
  
      // Get products under listed categories
      const products = await productModel.find({
        isBlocked: false,
        category: { $in: categories.map(category => category._id) }
      }).populate("category");
  
      // Sort by newest
      products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
      // Add wishlist status and effective discount
      const wishlistProductIds = [];
      if (userId) {
        const wishlist = await wishlistModel.findOne({ userId });
        if (wishlist) {
          wishlistProductIds.push(...wishlist.product.map(id => id.toString()));
        }
      }
  
      products.forEach(product => {
        // Mark if in wishlist
        product.inWishlist = wishlistProductIds.includes(product._id.toString());
  
        // Compare category offer with product discount
        const productDiscount = product.discount || 0;
        const categoryOffer = product.category?.categoryOffer || 0;
        product.effectiveDiscount = Math.max(productDiscount, categoryOffer);
      });

  
      const renderData = {
        categories,
        products,
      };
  
      if (userId) {
        renderData.user = await userModel.findById(userId);
      }
  
      return res.render("home", renderData);
  
    } catch (error) {
      console.log("Home page error:", error);
      return res.status(500).send("Server error");
    }
  };
  

const loadSignup = (req, res) => {
    try {
        res.render('signup');
    } catch (error) {
        console.log('signup page not found');
        res.status(500).send('server error')
    }
}
const loadForgotPassword = (req, res) => {
    try {
        res.render('forgot-password');
    } catch (error) {
        console.log('forgot-password page not found');
        res.status(500).send('server error')
    }
}

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "OTP for Verification",
            text: `Your OTP is ${otp}`,
            html: `<b>Your OTP is ${otp}</b>`
        })

        return info.accepted.length > 0;

    } catch (error) {
        console.error("Error for sending email", error)
        return false
    }
}

const generateReferralCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase(); // e.g., "K8FH29"
  };

const userSignUp = async (req, res) => {
    try {

        const { name, email, phone, password, confirmPassword, referralCode } = req.body;

        if (!name || !email || !phone || !password || !confirmPassword) {
            return res.render('signup', { msg: `please Enter all fields` })
        }

        const userExist = await userModel.findOne({ email });

        if (userExist) {
            return res.render('signup', { msg: `user is already registered` });
        }

        if (password !== confirmPassword) {
            return res.render('signup', { msg: `password and confirm password is not match` })
        }

        const otp = generateOtp();

        const emailSend = await sendVerificationEmail(email, otp)

        if (!emailSend) {
            return res.json("email-error")
        }

        req.session.userOtp = otp;
        req.session.userData = { name, email, phone, password, referredBy:referralCode };

        res.render('verify-otp');

    } catch (error) {
        console.error('signup error', error)
        res.redirect('/pageNotFound')
    }
}

const verifyOtp = async (req, res) => {

    try {
        const { otp } = req.body

        if (req.session.userOtp === otp) {

            const user = req.session.userData

            const hashedPassword = await bcrypt.hash(user.password, 10)

            let referrer = null;
            if (user.referredBy) {
              referrer = await userModel.findOne({ referralCode: user.referredBy });
            }

            const userData = {
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: hashedPassword,
                referralCode: generateReferralCode(),
                referredBy: user.referredBy && referrer ? user.referredBy : null
            }

            const newUser = new userModel(userData)

            await newUser.save();

            if (referrer) {
                const coupon = new couponModel({
                    name: "REF" + Math.random().toString(36).substring(2, 8).toUpperCase(),
                    offerPrice: 100, // ₹100 or % discount
                    userId: referrer._id,
                    expireOn: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    isReferralCoupon: true
                });
          
                await coupon.save();
              }


            req.session.user = newUser._id;

            res.json({ success: true, redirectUrl: '/login' })
        } else {
            res.status(400).json({
                success: false,
                message: 'Invalid OTP, Please try again'
            })
        }
    } catch (error) {
        console.error('Error verifying OTP', error);
        res.status(500).json({
            success: false,
            message: 'error occured'
        })
    }

}

const resendOtp = async (req, res) => {
    try {

        const { email } = req.session.userData;

        console.log(email)
        const resendOtp = generateOtp()

        const emailSend = await sendVerificationEmail(email, resendOtp)

        req.session.userOtp = resendOtp

        if (emailSend) {
            return res.json({
                success: true
            })
        } else {
            return res.status(400).json({
                success: false,
                message: 'Failed to resend OTP. Please try again'
            })
        }

    } catch (error) {
        console.error('Error resending OTP', error);
        res.status(500).json({ success: false, message: 'Internal Server Error, Please try again' });
    }
}

//user login
const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body


        const findUser = await userModel.findOne({ email });

        if (!findUser) {
            return res.render('login', { msg: `Please Sign up` })
        }

        if (findUser.isBlocked) {
            return res.render('login', { msg: `User is blocked by Admin` })
        }

        const checkPassword = await bcrypt.compare(password, findUser.password)

        if (!checkPassword) {
           return res.render('login', { msg: `Invalid credentials` })
        }

        const name = findUser.name;

        req.session.user = findUser._id;

        return res.redirect('/');
    } catch (error) {
        console.error('Login Error', error);
        res.render('login', { msg: `Login Failed Try again` });
    }

}

const logOut = async (req, res) => {
    try {

        req.session.destroy((err) => {
            if (err) {
                console.log('Session destruction error', err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/');
        })

    } catch (error) {
        console.log('logout error', error);
        res.redirect('/pageNotFound')
    }
}

const forgotPassEmailVerify = async (req, res) => {
    try {
        const { email } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.render('forgot-password', { msg: `User is not found` });
        }

        const otp = generateOtp();
        const emailSend = await sendVerificationEmail(user.email, otp)

        if (emailSend) {
            req.session.userOtp = otp;
            req.session.email = email;

            return res.render('forgotPass-otp');
        } else {
            return res.render('forgot-password', { msg: `User with this email does not exists` });
        }


    } catch (error) {
        console.log('forgot email verify error', error);
        return res.redirect('/pageNotFound')
    }
}

const forgotPassOtpVerify = async (req, res) => {
    try {
        const { otp } = req.body;

        if (req.session.userOtp === otp) {
            return res.json({
                success: true,
                redirectUrl: '/change-password'
            })
        } else {
            return res.json({
                success: false,
            })
        }
    } catch (error) {
        console.log('forgot password otp verify error', error);
        return res.redirect('/pageNotFound')
    }
}

const changePassword = async (req, res) => {
    try {
        
        res.render("change-password");

    } catch (error) {

        res.redirect("/pageNotFound")
        
    }
}

const forgotPassResendOtp = async (req,res)=>{

    try {
        const otp = generateOtp();
    const email = req.session.email;

    const sendEmail = await sendVerificationEmail(email, otp);

    if(sendEmail){
        req.session.userOtp = otp;
        return res.status(200).json({
            success:true,
            message:'Resend OTP successful'
        })
    }
    } catch (error) {
        console.error('error in forgot password resend otp',error);
        return res.status(500).json({
            success:false,
            message:'Internal server error'
        })
    }
    
}

const newPassword = async (req,res)=>{
    try {
        const {newPassword, confirmPassword} = req.body;

        if(newPassword !== confirmPassword){
            return res.status(400).json({
                success:false,
                message:'mismatch password'
            })
        }

        const email = req.session.email;

        const hashedPassword = await bcrypt.hash(newPassword,10);

       const updateNewPassword = await userModel.updateOne({email},{$set:{password:hashedPassword}});
        
       if(updateNewPassword){
        return res.status(200).json({
            success:true,
            message:'Password has changed successfully'
        })
       }

    } catch (error) {
        
    }
}

module.exports = {
    loadHome,
    pageNotFound,
    loadLogin,
    loadSignup,
    loadForgotPassword,
    userSignUp,
    verifyOtp,
    resendOtp,
    userLogin,
    logOut,
    forgotPassEmailVerify,
    forgotPassOtpVerify,
    changePassword,
    forgotPassResendOtp,
    newPassword
}