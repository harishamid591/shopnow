const userModel = require('../../models/userSchema');
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, otp) {
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: process.env.NODEMAILER_EMAIL,
      to: email,
      subject: 'OTP for Verification',
      text: `Your OTP is ${otp}`,
      html: `<b>Your OTP is ${otp}</b>`,
    });

    return info.accepted.length > 0;
  } catch (error) {
    console.error('Error for sending email', error);
    return false;
  }
}

const userProfile = async (req, res) => {
  try {
    const userId = req.session.user;

    const user = await userModel.findOne({ _id: userId });

    return res.render('profile', {
      user,
      currentPage: 'profile',
    });
  } catch (error) {
    console.error('Error:', error);
    res.redirect('/pageNotFound');
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user;
    const { name, email, phone } = req.body;
    const updateData = { name, email, phone };

    if (req.file) {
      updateData.profilePicture = `/uploads/profileImages/${req.file.filename}`;
    }

    await userModel.findByIdAndUpdate(userId, updateData);

    return res.redirect('/userProfile');
  } catch (error) {
    console.log(error);
    res.redirect('/pageNotFound');
  }
  
};

const changeEmail = async (req, res) => {
  try {
    const userId = req.session.user;
    const user = await userModel.findById(userId);

    return res.render('change-email', {
      user,
    });
  } catch (error) {
    console.log(error)
    res.redirect('/pageNotFound');
  }
};

const changeEmailValid = async (req, res) => {
  try {
    const userId = req.session.user;
    const { newEmail } = req.body;

    const existEmail = await userModel.findOne({ email: newEmail });

    const userData = await userModel.findOne({ _id: userId });

    if (existEmail) {
      return res.render('change-email', {
        user: userData,
        error: 'These Email id is exist, add another Email id',
      });
    }

    const otp = generateOtp();

    const emailSend = await sendVerificationEmail(newEmail, otp);

    if (!emailSend) {
      return res.render('change-email', {
        user: userData,
        error: 'Email Send Error',
      });
    }

    req.session.userOtp = otp;
    req.session.newEmail = newEmail;

    res.render('change-email-otp', { newEmail, user: userData });
  } catch (error) {
    console.log(error)
    res.redirect('/pageNotFound');
  }
};

const verifyEmailOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    const userId = req.session.user;
    const newEmail = req.session.newEmail;

    if (req.session.userOtp === otp) {
      await userModel.findByIdAndUpdate(userId, {
        email: newEmail,
      });

      return res.json({
        success: true,
      });
    } else {
      return res.json({
        success: false,
      });
    }
  } catch (error) {
    console.log(error);
    res.redirect('/pageNotFound');
  }
};

const resendEmailOtp = async (req, res) => {
  try {
    const newEmail = req.session.newEmail;

    const otp = generateOtp();

    const sendMail = await sendVerificationEmail(newEmail, otp);

    if (!sendMail) {
      return res.json({
        success: false,
        message: 'Send Email Failed, Try again later',
      });
    }

    req.session.userOtp = otp;

    return res.json({
      success: true,
    });
  } catch (error) {
    console.log(error)
    res.redirect('/pageNotFound');
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const userId = req.session.user;

    const userData = await userModel.findById(userId);

    const password = userData.password;

    const checkPassword = await bcrypt.compare(currentPassword, password);

    if (!checkPassword) {
      return res.render('profile', {
        user: userData,
        error: 'You have entered incorrect password',
        currentPage: 'profile',
      });
    }

    if (newPassword !== confirmPassword) {
      return res.render('profile', {
        user: userData,
        error: 'new password and confirm password is not match',
        currentPage: 'profile',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await userModel.findByIdAndUpdate(userId, {
      password: hashedPassword,
    });

    return res.render('profile', {
      user: userData,
      success: 'Password has changed successfully',
      currentPage: 'profile',
    });
  } catch (error) {
    console.log(error)
    res.redirect('/pageNotFound');
  }
};

const getForgotPassPage = async (req, res) => {
  try {
    res.render('forgot-password');
  } catch (error) {
    console.log(error)
    res.redirect('/pageNotFound');
  }
};

module.exports = {
  userProfile,
  updateProfile,
  changeEmail,
  changeEmailValid,
  verifyEmailOtp,
  resendEmailOtp,
  changePassword,
  getForgotPassPage,
};
