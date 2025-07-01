const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log('DB is connected');
  } catch (error) {
    console.log('DB is failed to connect ',error);
  }
};

module.exports = connectDB;
