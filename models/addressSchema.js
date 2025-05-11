const mongoose = require('mongoose')
const {Schema} = mongoose;


const addressSchema = new Schema({
    userId:{
        type: Schema.Types.ObjectId,
        ref:'User',
        required:true
    },
    address:[{
        houseName:{
            type:String,
            required: true
        },
        city:{
            type:String,
            required:true
        },
        town:{
            type:String,
            required:true
        },
        state:{
            type:String,
            required:true
        },
        pin:{
            type: Number,
            required: true
        },
        phone:{
            type:Number,
            required:true
        }
    }],
},{
    timestamps:true
})

const addressModel = mongoose.model('Address',addressSchema);

module.exports = addressModel;