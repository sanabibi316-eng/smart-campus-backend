const express = require('express');
const router = express.Router();
const {
  login,
  logout,
  getMe,
  changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const {
  loginValidation,
  changePasswordValidation,
} = require('../middleware/validate');

router.post('/login', loginValidation, login);
router.post('/logout', protect, logout);
router.get('/me', protect, getMe);
router.patch('/change-password', protect, changePasswordValidation, changePassword);

module.exports = router;