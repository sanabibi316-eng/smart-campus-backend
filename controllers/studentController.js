const User = require('../models/User');
const Student = require('../models/Student');
const Class = require('../models/Class');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse, buildSearchQuery } = require('../utils/helpers');

// @desc    Get all students (with search, filter, pagination)
// @route   GET /api/v1/students
// @access  Admin
const getStudents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    class: classId,
    status,
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
  if (classId) {
    filter.class = classId;
  }

  // Build search
  let searchFilter = {};
  if (search) {
    const regex = new RegExp(search, 'i');
    // Search in student fields and user fields via lookup
    searchFilter = {
      $or: [
        { studentId: regex },
        { phone: regex },
        { address: regex },
      ],
    };
  }

  // Combine filters
  const query = { ...filter, ...searchFilter };

  // If searching by name or email, we need to find matching users first
  let userIds = null;
  if (search) {
    const regex = new RegExp(search, 'i');
    const matchingUsers = await User.find({
      role: 'student',
      $or: [{ name: regex }, { email: regex }],
    }).select('_id');
    userIds = matchingUsers.map((u) => u._id);

    if (userIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No students found',
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    query.user = { $in: userIds };
  }

  const totalRecords = await Student.countDocuments(query);

  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const students = await Student.find(query)
    .populate('user', 'name email role status')
    .populate('class', 'name code academicYear')
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  res.status(200).json({
    success: true,
    message: 'Students retrieved successfully',
    data: students,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single student
// @route   GET /api/v1/students/:id
// @access  Admin, or student viewing own profile
const getStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id)
    .populate('user', 'name email role status createdAt')
    .populate('class', 'name code academicYear classTeacher');

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  // Students can only view their own profile
  if (
    req.user.role === 'student' &&
    student.user._id.toString() !== req.user._id.toString()
  ) {
    throw ApiError.forbidden('You can only view your own profile');
  }

  res.status(200).json({
    success: true,
    message: 'Student retrieved successfully',
    data: student,
  });
});

// @desc    Create student (also creates User account)
// @route   POST /api/v1/students
// @access  Admin
const createStudent = asyncHandler(async (req, res) => {
  const {
    name,
    email,
    password,
    studentId,
    class: classId,
    phone,
    dateOfBirth,
    address,
    admissionDate,
  } = req.body;

  // Check if class exists
  const existingClass = await Class.findById(classId);
  if (!existingClass) {
    throw ApiError.badRequest('Class not found');
  }

  // Check if email already exists
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  // Check if studentId already exists
  const existingStudent = await Student.findOne({ studentId });
  if (existingStudent) {
    throw ApiError.conflict('Student ID already exists');
  }

  // Create user account
  let user;
  try {
    user = await User.create({
      name,
      email,
      password,
      role: 'student',
      status: 'active',
    });
  } catch (error) {
    throw ApiError.badRequest('Failed to create user account', [error.message]);
  }

  // Create student profile
  let student;
  try {
    student = await Student.create({
      user: user._id,
      studentId,
      class: classId,
      phone: phone || '',
      dateOfBirth: dateOfBirth || null,
      address: address || '',
      admissionDate: admissionDate || Date.now(),
      status: 'active',
    });
  } catch (error) {
    // Rollback: delete user if student creation fails
    await User.findByIdAndDelete(user._id);
    if (error.code === 11000) {
      throw ApiError.conflict('Student ID already exists');
    }
    throw ApiError.badRequest('Failed to create student profile', [error.message]);
  }

  // Populate for response
  student = await Student.findById(student._id)
    .populate('user', 'name email role status')
    .populate('class', 'name code academicYear');

  res.status(201).json({
    success: true,
    message: 'Student created successfully',
    data: student,
  });
});

// @desc    Update student
// @route   PATCH /api/v1/students/:id
// @access  Admin
const updateStudent = asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);

  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  const {
    name,
    email,
    class: classId,
    phone,
    dateOfBirth,
    address,
  } = req.body;

  // Validate class if provided
  if (classId) {
    const existingClass = await Class.findById(classId);
    if (!existingClass) {
      throw ApiError.badRequest('Class not found');
    }
    student.class = classId;
  }

  // Update student fields
  if (phone !== undefined) student.phone = phone;
  if (dateOfBirth !== undefined) student.dateOfBirth = dateOfBirth;
  if (address !== undefined) student.address = address;

  await student.save();

  // Update user fields if provided
  if (name || email) {
    const userUpdate = {};
    if (name) userUpdate.name = name;
    if (email) {
      // Check email uniqueness
      const existingUser = await User.findOne({
        email,
        _id: { $ne: student.user },
      });
      if (existingUser) {
        throw ApiError.conflict('Email already registered');
      }
      userUpdate.email = email;
    }
    await User.findByIdAndUpdate(student.user, userUpdate);
  }

  // Populate for response
  const updatedStudent = await Student.findById(student._id)
    .populate('user', 'name email role status')
    .populate('class', 'name code academicYear');

  res.status(200).json({
    success: true,
    message: 'Student updated successfully',
    data: updatedStudent,
  });
});

// @desc    Toggle student status (activate/deactivate)
// @route   PATCH /api/v1/students/:id/status
// @access  Admin
const toggleStudentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const student = await Student.findById(req.params.id);
  if (!student) {
    throw ApiError.notFound('Student not found');
  }

  // Update student status
  student.status = status;
  await student.save();

  // Also update user status
  await User.findByIdAndUpdate(student.user, { status });

  const updatedStudent = await Student.findById(student._id)
    .populate('user', 'name email role status')
    .populate('class', 'name code academicYear');

  res.status(200).json({
    success: true,
    message: `Student ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: updatedStudent,
  });
});

// @desc    Get student's own profile (for student role)
// @route   GET /api/v1/students/me
// @access  Student
const getMyProfile = asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id })
    .populate('user', 'name email role status')
    .populate('class', 'name code academicYear');

  if (!student) {
    throw ApiError.notFound('Student profile not found');
  }

  res.status(200).json({
    success: true,
    message: 'Profile retrieved successfully',
    data: student,
  });
});

module.exports = {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  toggleStudentStatus,
  getMyProfile,
};