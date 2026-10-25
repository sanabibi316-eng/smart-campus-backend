const Subject = require('../models/Subject');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse } = require('../utils/helpers');

// @desc    Get all subjects (with search, filter, pagination)
// @route   GET /api/v1/subjects
// @access  All authenticated (filtered by role)
const getSubjects = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 50,
    search = '',
    status,
    class: classId,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  if (status && ['active', 'inactive'].includes(status)) {
    filter.status = status;
  }
  if (classId) {
    filter.class = classId;
  }
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
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (teacherProfile) {
      filter.teacher = teacherProfile._id;
    } else {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
  }

  const totalRecords = await Subject.countDocuments(filter);

  const subjects = await Subject.find(filter)
    .populate('class', 'name code academicYear')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    })
    .sort({ name: 1 })
    .skip(skip)
    .limit(limitNum);

  res.status(200).json({
    success: true,
    message: 'Subjects retrieved successfully',
    data: subjects,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single subject
// @route   GET /api/v1/subjects/:id
// @access  All authenticated
const getSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id)
    .populate('class', 'name code academicYear')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  if (!subject) {
    throw ApiError.notFound('Subject not found');
  }

  res.status(200).json({
    success: true,
    message: 'Subject retrieved successfully',
    data: subject,
  });
});

// @desc    Create subject
// @route   POST /api/v1/subjects
// @access  Admin
const createSubject = asyncHandler(async (req, res) => {
  const { name, code, class: classId, teacher, description } = req.body;

  // Check code uniqueness
  const existing = await Subject.findOne({ code });
  if (existing) {
    throw ApiError.conflict('Subject code already exists');
  }

  // Validate class
  const cls = await Class.findById(classId);
  if (!cls) {
    throw ApiError.badRequest('Class not found');
  }

  // Validate teacher if provided
  if (teacher) {
    const teacherDoc = await Teacher.findById(teacher);
    if (!teacherDoc) {
      throw ApiError.badRequest('Teacher not found');
    }
  }

  const subject = await Subject.create({
    name,
    code,
    class: classId,
    teacher: teacher || null,
    description: description || '',
    status: 'active',
  });

  const populated = await Subject.findById(subject._id)
    .populate('class', 'name code academicYear')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(201).json({
    success: true,
    message: 'Subject created successfully',
    data: populated,
  });
});

// @desc    Update subject
// @route   PATCH /api/v1/subjects/:id
// @access  Admin
const updateSubject = asyncHandler(async (req, res) => {
  const subject = await Subject.findById(req.params.id);

  if (!subject) {
    throw ApiError.notFound('Subject not found');
  }

  const { name, code, class: classId, teacher, description } = req.body;

  // Check code uniqueness if changing
  if (code && code !== subject.code) {
    const existing = await Subject.findOne({ code });
    if (existing) {
      throw ApiError.conflict('Subject code already exists');
    }
  }

  // Validate class if changing
  if (classId) {
    const cls = await Class.findById(classId);
    if (!cls) {
      throw ApiError.badRequest('Class not found');
    }
    subject.class = classId;
  }

  // Validate teacher if changing
  if (teacher !== undefined) {
    if (teacher === null) {
      subject.teacher = null;
    } else {
      const teacherDoc = await Teacher.findById(teacher);
      if (!teacherDoc) {
        throw ApiError.badRequest('Teacher not found');
      }
      subject.teacher = teacher;
    }
  }

  if (name) subject.name = name;
  if (code) subject.code = code;
  if (description !== undefined) subject.description = description;

  await subject.save();

  const populated = await Subject.findById(subject._id)
    .populate('class', 'name code academicYear')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(200).json({
    success: true,
    message: 'Subject updated successfully',
    data: populated,
  });
});

// @desc    Toggle subject status
// @route   PATCH /api/v1/subjects/:id/status
// @access  Admin
const toggleSubjectStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const subject = await Subject.findById(req.params.id);
  if (!subject) {
    throw ApiError.notFound('Subject not found');
  }

  subject.status = status;
  await subject.save();

  res.status(200).json({
    success: true,
    message: `Subject ${status === 'active' ? 'activated' : 'deactivated'} successfully`,
    data: subject,
  });
});

module.exports = {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  toggleSubjectStatus,
};