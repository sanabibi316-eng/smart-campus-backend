const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse } = require('../utils/helpers');

// @desc    Get all classes (with search, filter, pagination)
// @route   GET /api/v1/classes
// @access  All authenticated (filtered by role)
const getClasses = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    search = '',
    status,
    academicYear,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  // Status filter
  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status;
  }

  // Academic year filter
  if (academicYear) {
    filter.academicYear = academicYear;
  }

  // Search filter
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [
      { name: regex },
      { code: regex },
      { description: regex },
    ];
  }

  // Role-based filtering
  if (req.user.role === 'teacher') {
    // Teachers only see their assigned classes
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (!teacherProfile) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter._id = { $in: teacherProfile.assignedClasses };
  } else if (req.user.role === 'student') {
    // Students only see their own class
    const studentProfile = await Student.findOne({ user: req.user._id });
    if (!studentProfile || !studentProfile.class) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter._id = studentProfile.class;
  }

  const totalRecords = await Class.countDocuments(filter);

  const classes = await Class.find(filter)
    .populate('classTeacher', 'teacherId')
    .populate({
      path: 'classTeacher',
      populate: { path: 'user', select: 'name email' },
    })
    .sort({ name: 1 })
    .skip(skip)
    .limit(limitNum);

  // Get student counts for each class
  const classesWithCounts = await Promise.all(
    classes.map(async (cls) => {
      const studentCount = await Student.countDocuments({
        class: cls._id,
        status: 'active',
      });
      return {
        ...cls.toObject(),
        studentCount,
      };
    })
  );

  res.status(200).json({
    success: true,
    message: 'Classes retrieved successfully',
    data: classesWithCounts,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single class with students
// @route   GET /api/v1/classes/:id
// @access  All authenticated (with authorization check)
const getClass = asyncHandler(async (req, res) => {
  const cls = await Class.findById(req.params.id)
    .populate({
      path: 'classTeacher',
      populate: { path: 'user', select: 'name email' },
    });

  if (!cls) {
    throw ApiError.notFound('Class not found');
  }

  // Authorization: teachers can only view assigned classes
  if (req.user.role === 'teacher') {
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (
      !teacherProfile ||
      !teacherProfile.assignedClasses.some(
        (c) => c.toString() === cls._id.toString()
      )
    ) {
      throw ApiError.forbidden('You are not assigned to this class');
    }
  }

  // Get students in this class
  const students = await Student.find({ class: cls._id, status: 'active' })
    .populate('user', 'name email')
    .sort({ 'user.name': 1 });

  res.status(200).json({
    success: true,
    message: 'Class retrieved successfully',
    data: {
      ...cls.toObject(),
      students,
      studentCount: students.length,
    },
  });
});

// @desc    Create class
// @route   POST /api/v1/classes
// @access  Admin
const createClass = asyncHandler(async (req, res) => {
  const { name, code, academicYear, classTeacher, description } = req.body;

  // Check if code already exists
  const existingClass = await Class.findOne({ code });
  if (existingClass) {
    throw ApiError.conflict('Class code already exists');
  }

  // Validate teacher if provided
  if (classTeacher) {
    const teacher = await Teacher.findById(classTeacher);
    if (!teacher) {
      throw ApiError.badRequest('Teacher not found');
    }
  }

  const cls = await Class.create({
    name,
    code,
    academicYear,
    classTeacher: classTeacher || null,
    description: description || '',
    status: 'active',
  });

  // If class teacher assigned, add class to teacher's assignedClasses
  if (classTeacher) {
    await Teacher.findByIdAndUpdate(classTeacher, {
      $addToSet: { assignedClasses: cls._id },
    });
  }

  const populated = await Class.findById(cls._id)
    .populate({
      path: 'classTeacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(201).json({
    success: true,
    message: 'Class created successfully',
    data: populated,
  });
});

// @desc    Update class
// @route   PATCH /api/v1/classes/:id
// @access  Admin
const updateClass = asyncHandler(async (req, res) => {
  const cls = await Class.findById(req.params.id);

  if (!cls) {
    throw ApiError.notFound('Class not found');
  }

  const { name, code, academicYear, classTeacher, description } = req.body;

  // Check code uniqueness if changing
  if (code && code !== cls.code) {
    const existing = await Class.findOne({ code });
    if (existing) {
      throw ApiError.conflict('Class code already exists');
    }
  }

  // Handle class teacher change
  if (classTeacher !== undefined) {
    if (classTeacher === null) {
      // Remove old teacher's reference
      if (cls.classTeacher) {
        await Teacher.findByIdAndUpdate(cls.classTeacher, {
          $pull: { assignedClasses: cls._id },
        });
      }
      cls.classTeacher = null;
    } else {
      const teacher = await Teacher.findById(classTeacher);
      if (!teacher) {
        throw ApiError.badRequest('Teacher not found');
      }
      // Remove from old teacher
      if (cls.classTeacher && cls.classTeacher.toString() !== classTeacher) {
        await Teacher.findByIdAndUpdate(cls.classTeacher, {
          $pull: { assignedClasses: cls._id },
        });
      }
      // Add to new teacher
      await Teacher.findByIdAndUpdate(classTeacher, {
        $addToSet: { assignedClasses: cls._id },
      });
      cls.classTeacher = classTeacher;
    }
  }

  if (name) cls.name = name;
  if (code) cls.code = code;
  if (academicYear) cls.academicYear = academicYear;
  if (description !== undefined) cls.description = description;

  await cls.save();

  const populated = await Class.findById(cls._id)
    .populate({
      path: 'classTeacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(200).json({
    success: true,
    message: 'Class updated successfully',
    data: populated,
  });
});

// @desc    Toggle class status
// @route   PATCH /api/v1/classes/:id/status
// @access  Admin
const toggleClassStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const cls = await Class.findById(req.params.id);
  if (!cls) {
    throw ApiError.notFound('Class not found');
  }

  cls.status = status;
  await cls.save();

  res.status(200).json({
    success: true,
    message: `Class ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: cls,
  });
});

module.exports = {
  getClasses,
  getClass,
  createClass,
  updateClass,
  toggleClassStatus,
};