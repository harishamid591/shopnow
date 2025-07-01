// config/usermulter.js
const multer = require('multer');
const path = require('path');

// Profile Image Upload
const profileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/profileImages/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.session.user}_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const uploadProfileImage = multer({ storage: profileStorage });

// Return Image Upload
const returnImageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/uploads/returnImages/');
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${req.session.user}_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const uploadReturnImages = multer({ storage: returnImageStorage });

module.exports = {
  uploadProfileImage,
  uploadReturnImages,
};
