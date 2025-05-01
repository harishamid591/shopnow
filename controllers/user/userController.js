

const pageNotFound = async(req,res)=>{
    try {
        return res.render('page-404')
    } catch (error) {
        return redirect('/pageNotFound');
    }
}

const loadHome = async(req,res)=>{
    try {
        return res.render('home')
    } catch (error) {
     console.log('home page not found')
     res.status(500).send('server error')   
    }
}

module.exports = {loadHome, pageNotFound}