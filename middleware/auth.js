const userModel = require("../models/userSchema");

const userAuth = (req, res, next) => {

    if (req.session.user) {
        userModel.findById(req.session.user)
            .then((data) => {
                if (data && !data.isBlocked) {
                    next()
                } else {
                    res.redirect('/login');
                }
            }).catch(error => {
                console.log('error in user auth middleware', error);
                res.status(500).send('Internal server error')
            })
    } else {
        res.redirect('/login')
    }
}

const adminAuth = (req, res, next) => {
    if (req.session.admin) {
        userModel.findById(req.session.admin)
            .then((admin) => {
                if (admin && admin.isAdmin) {
                    next()
                }else{
                    req.session.destroy();
                    res.redirect('/admin/login')
                }
            }).catch(error =>{
                console.error('Admin Auth Error',error);
                res.redirect('/admin/login');
            })
    }else{
        res.redirect('/admin/login');
    }
}

const isUserBlocked = async (req,res, next)=>{

    try {
        if(req.session.user){
            const user = await userModel.findById(req.session.user)
     
            if(user && user.isBlocked){
                 delete req.session.user;
                 return res.redirect('/login');
            }
         }
     
         next();
    } catch (error) {
        console.error("Error checking blocked user:", error);
        res.status(500).send('Server Error');
    }
}

const isUserLoggedIn = async(req, res, next)=>{

    if(req.session.user){
        return res.redirect('/')
    }else{
        next()
    }
}

module.exports = { 
    userAuth, 
    adminAuth, 
    isUserBlocked,
    isUserLoggedIn 
};