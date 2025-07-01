const mongoose = require('mongoose');
const { Schema } = mongoose;

const brandSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
  },
  { timestamps: true }
);

const brandModel = mongoose.model('Brand', brandSchema);

module.exports = brandModel;
