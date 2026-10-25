const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// Set token in HTTP-only cookie
const sendTokenResponse = (user, statusCode, res, message) => {
  const token = generateToken(user._id);

  const cookieExpire = parseInt(process.env.JWT_COOKIE_EXPIRE) || 7;

  const options = {
    expires: new Date(Date.now() + cookieExpire * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  };

  res.status(statusCode).cookie('token', token, options).json({
    success: true,
    message,
    data: {
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
      token,
    },
  });
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user with password field
  const user = await User.findOne({ email }).select('+password');

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Check password
  const isMatch = await user.comparePassword(password);

  if (!isMatch) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Check if account is active
  if (user.status !== 'active') {
    throw ApiError.unauthorized('Your account has been deactivated. Contact administrator.');
  }

  sendTokenResponse(user, 200, res, 'Login successful');
});

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = asyncHandler(async (req, res) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 5 * 1000),
    httpOnly: true,
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
    data: null,
  });
});

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  let profileData = null;

  // Get role-specific profile data
  if (user.role === 'student') {
    profileData = await Student.findOne({ user: user._id })
      .populate('class', 'name code academicYear');
  } else if (user.role === 'teacher') {
    profileData = await Teacher.findOne({ user: user._id })
      .populate('assignedClasses', 'name code');
  }

  res.status(200).json({
    success: true,
    message: 'User profile retrieved',
    data: {
      user,
      profile: profileData,
    },
  });
});

// @desc    Change password
// @route   PATCH /api/v1/auth/change-password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  // Check if new password is same as current
  const isSame = await user.comparePassword(newPassword);
  if (isSame) {
    throw ApiError.badRequest('New password must be different from current password');
  }

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, res, 'Password changed successfully');
});

module.exports = {
  login,
  logout,
  getMe,
  changePassword,
};