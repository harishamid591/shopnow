const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin/adminController');
const customerController = require('../controllers/admin/customerController')
const categoryController = require('../controllers/admin/categoryController')
const productController = require('../controllers/admin/productController')
const upload = require('../config/multer')


const { userAuth, adminAuth } = require('../middleware/auth');


router.get('/pageerror',adminController.pageerror);
//Login Management
router.get('/login',adminController.loadLogin);
router.post('/login',adminController.adminLogin);
router.get('/dashboard',adminAuth,adminController.loadDashboard)
router.get('/logout',adminController.logout);

//Customer Management
router.get('/users',adminAuth,customerController.displayCustomer)
router.get('/blockCustomer',adminAuth,customerController.blockCustomer);
router.get('/unblockCustomer',adminAuth,customerController.unblockCustomer);

//Category Management
router.get('/category',adminAuth,categoryController.categoryInfo);
router.post('/addCategory',adminAuth,upload.single('image'),categoryController.addCategory);
router.post('/category-edit/:id',adminAuth,upload.single('image'),categoryController.editCategory);
router.post('/category-delete/:id',adminAuth,upload.single('image'),categoryController.deleteCategory);
router.post('/category-list/:id',adminAuth,categoryController.listOrUnlistCategory);


//Product Management
router.get('/addProducts',adminAuth,productController.getProductAddPage);
router.post('/addProducts',adminAuth,upload.array('images'),productController.addProducts);
router.get('/products',adminAuth,productController.displayProducts)
router.post('/product-edit/:id',adminAuth, upload.none(),productController.editProduct)
router.post('/product-delete/:id',adminAuth,productController.deleteProduct)
router.post('/product-isBlocked/:id',adminAuth,productController.isBlockedProduct)





module.exports = router