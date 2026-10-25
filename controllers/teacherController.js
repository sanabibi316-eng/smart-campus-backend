const User = require('../models/User');
const Teacher = require('../models/Teacher');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse } = require('../utils/helpers');

// @desc    Get all teachers (with search, filter, pagination)
// @route   GET /api/v1/teachers
// @access  Admin
const getTeachers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    status,
    specialization,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const filter = {};
  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status;
  }
  if (specialization) {
    filter.specialization = new RegExp(specialization, 'i');
  }

  // Search by teacher fields
  let searchFilter = {};
  if (search) {
    const regex = new RegExp(search, 'i');
    searchFilter = {
      $or: [
        { teacherId: regex },
        { phone: regex },
        { specialization: regex },
      ],
    };
  }

  // If searching by name or email, find matching users first
  let userIds = null;
  if (search) {
    const regex = new RegExp(search, 'i');
    const matchingUsers = await User.find({
      role: 'teacher',
      $or: [{ name: regex }, { email: regex }],
    }).select('_id');
    userIds = matchingUsers.map((u) => u._id);

    if (userIds.length === 0 && Object.keys(searchFilter).length > 0) {
      // No user match, but might match teacher fields - continue
    } else if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No teachers found',
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }

    if (userIds.length > 0) {
      filter.user = { $in: userIds };
    }
  }

  const query = { ...filter, ...searchFilter };
  const totalRecords = await Teacher.countDocuments(query);

  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const teachers = await Teacher.find(query)
    .populate('user', 'name email role status')
    .populate('assignedClasses', 'name code')
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  res.status(200).json({
    success: true,
    message: 'Teachers retrieved successfully',
    data: teachers,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single teacher
// @route   GET /api/v1/teachers/:id
// @access  Admin, or teacher viewing own profile
const getTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id)
    .populate('user', 'name email role status createdAt')
    .populate('assignedClasses', 'name code academicYear');

  if (!teacher) {
    throw ApiError.notFound('Teacher not found');
  }

  // Teachers can only view their own profile
  if (
    req.user.role === 'teacher' &&
    teacher.user._id.toString() !== req.user._id.toString()
  ) {
    throw ApiError.forbidden('You can only view your own profile');
  }

  res.status(200).json({
    success: true,
    message: 'Teacher retrieved successfully',
    data: teacher,
  });
});

// @desc    Create teacher (also creates User account)
// @route   POST /api/v1/teachers
// @access  Admin
const createTeacher = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    teacherId,
    phone,
    specialization,
    joiningDate,
  } = req.body;

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  // Check if teacherId already exists
  const existingTeacher = await Teacher.findOne({ teacherId });
  if (existingTeacher) {
    throw ApiError.conflict('Teacher ID already exists');
  }

  // Create user account
  let user;
  try {
    user = await User.create({
      name,
      email,
      password,
      role: 'teacher',
      status: 'active',
    });
  } catch (error) {
    throw ApiError.badRequest('Failed to create user account', [error.message]);
  }

  // Create teacher profile
  let teacher;
  try {
    teacher = await Teacher.create({
      user: user._id,
      teacherId,
      phone: phone || '',
      specialization: specialization || '',
      joiningDate: joiningDate || Date.now(),
      status: 'active',
    });
  } catch (error) {
    // Rollback: delete user if teacher creation fails
    await User.findByIdAndDelete(user._id);
    if (error.code === 11000) {
      throw ApiError.conflict('Teacher ID already exists');
    }
    throw ApiError.badRequest('Failed to create teacher profile', [error.message]);
  }

  // Populate for response
  teacher = await Teacher.findById(teacher._id)
    .populate('user', 'name email role status')
    .populate('assignedClasses', 'name code');

  res.status(201).json({
    success: true,
    message: 'Teacher created successfully',
    data: teacher,
  });
});

// @desc    Update teacher
// @route   PATCH /api/v1/teachers/:id
// @access  Admin
const updateTeacher = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findById(req.params.id);

  if (!teacher) {
    throw ApiError.notFound('Teacher not found');
  }

  const { name, email, phone, specialization } = req.body;

  // Update teacher fields
  if (phone !== undefined) teacher.phone = phone;
  if (specialization !== undefined) teacher.specialization = specialization;

  await teacher.save();

  // Update user fields if provided
  if (name || email) {
    const userUpdate = {};
    if (name) userUpdate.name = name;
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: teacher.user },
      });
      if (existingUser) {
        throw ApiError.conflict('Email already registered');
      }
      userUpdate.email = email;
    }
    await User.findByIdAndUpdate(teacher.user, userUpdate);
  }

  // Populate for response
  const updatedTeacher = await Teacher.findById(teacher._id)
    .populate('user', 'name email role status')
    .populate('assignedClasses', 'name code');

  res.status(200).json({
    success: true,
    message: 'Teacher updated successfully',
    data: updatedTeacher,
  });
});

// @desc    Toggle teacher status
// @route   PATCH /api/v1/teachers/:id/status
// @access  Admin
const toggleTeacherStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const teacher = await Teacher.findById(req.params.id);
  if (!teacher) {
    throw ApiError.notFound('Teacher not found');
  }

  teacher.status = status;
  await teacher.save();

  // Also update user status
  await User.findByIdAndUpdate(teacher.user, { status });

  const updatedTeacher = await Teacher.findById(teacher._id)
    .populate('user', 'name email role status')
    .populate('assignedClasses', 'name code');

  res.status(200).json({
    success: true,
    message: `Teacher ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: updatedTeacher,
  });
});

// @desc    Get teacher's own profile
// @route   GET /api/v1/teachers/me
// @access  Teacher
const getMyProfile = asyncHandler(async (req, res) => {
  const teacher = await Teacher.findOne({ user: req.user._id })
    .populate('user', 'name email role status')
    .populate('assignedClasses', 'name code academicYear');

  if (!teacher) {
    throw ApiError.notFound('Teacher profile not found');
  }

  res.status(200).json({
    success: true,
    message: 'Profile retrieved successfully',
    data: teacher,
  });
});

module.exports = {
  getTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  toggleTeacherStatus,
  getMyProfile,
};