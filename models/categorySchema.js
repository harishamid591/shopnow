const mongoose = require('mongoose');
const {Schema} = mongoose

const categorySchema = new Schema({
    categoryName:{
        type:String,
        required:true,
        unique:true
    },
    categoryImage:{
        type:String,
        required:true
    },
    isListed:{
        type:Boolean,
        default:true
    }
},{
    timestamps:true
})

const categoryModel = mongoose.model('Category',categorySchema);

module.exports = categoryModel;