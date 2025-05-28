const userModel = require("../../models/userSchema")
const bcrypt = require('bcrypt')


const pageerror = (req,res)=>{
    res.render('admin-error')
}


const loadLogin = async (req, res) => {

    if (req.session.admin) {
        return res.redirect('/admin/dashboard')
    }
    res.render('adminLogin')

}

const adminLogin = async (req, res) => {
    
    try {

        const { email, password } = req.body;

        const findAdmin = await userModel.findOne({ email, isAdmin:true });
    
        if (!findAdmin) {
            return res.render('adminLogin', { msg: `Invalid Credentials` });
        }
    
        const checkPassword = await bcrypt.compare(password, findAdmin.password);
    
        if (!checkPassword) {
            return res.render('adminLogin', { msg: `Invalid Credentials` })
        }
    
        req.session.admin = findAdmin._id;
    
        return res.redirect('/admin/dashboard');

    } catch (error) {
        console.log('admin login error',error);
        return res.redirect('/pageeroor');
    }
}

const loadDashboard = async (req,res)=>{

    if(req.session.admin){
        try {
            return res.render('dashboard')
        } catch (error) {
            return res.redirect("/admin/login")
        }
    }else{
        return res.redirect('/admin/login');
    }
}

const logout = (req,res)=>{

    try {
        req.session.destroy((err)=>{
            if(err){
                return res.redirect('/admin/login')
            }
            return res.redirect('/admin/login')
        })
    } catch (error) {
        console.log('error occur while logout',error)
        return res.redirect('/admin/pageerror')
    }
    
}

module.exports = {
    loadLogin,
    adminLogin,
    loadDashboard,
    pageerror,
    logout
}