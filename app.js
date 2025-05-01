const express = require('express')
const app = express()
const dotenv = require('dotenv')
dotenv.config()
const path = require('path')


const userRouter = require('./routes/userRouter')


app.use(express.json())
app.use(express.urlencoded({extended:true}))


app.set('view engine','ejs');
app.set('views',[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,'public')))


app.use('/',userRouter);


const PORT = 3000 || process.env.PORT
app.listen(PORT,()=>{
    console.log('server is running');
})