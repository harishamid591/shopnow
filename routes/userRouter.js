const express = require('express')
const userController = require('../controllers/user/userController')
const productController = require('../controllers/user/productController')
const passport = require('passport')
const { isUserBlocked, isUserLoggedIn } = require('../middleware/auth')
const router = express.Router()




router.get('/pageNotFound',userController.pageNotFound)
router.get('/',isUserBlocked,userController.loadHome)
router.get('/login',isUserLoggedIn,userController.loadLogin);
router.get('/signup',isUserLoggedIn,userController.loadSignup);
router.post('/signup',userController.userSignUp);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);
router.get('/forgot-password',userController.loadForgotPassword);
router.post('/forgot-password-email',userController.forgotPassEmailVerify)

router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback', passport.authenticate('google', { failureRedirect: '/signup' }), (req, res) => {
  
    try {
        req.session.user = req.user._id
        res.redirect('/');
    } catch (error) {
        console.log("Google login error:", error);
        res.redirect('/signup');
    }
    
});


router.post('/login',userController.userLogin);
router.get('/logout',userController.logOut);


router.get('/productDetails/:id',productController.productDetails)




module.exports = router
