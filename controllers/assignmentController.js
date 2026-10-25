const Assignment = require('../models/Assignment');
const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Subject = require('../models/Subject');
const Class = require('../models/Class');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse } = require('../utils/helpers');

// Helper: Check if teacher is assigned to a class
const isTeacherAssignedToClass = async (userId, classId) => {
  const teacher = await Teacher.findOne({ user: userId });
  if (!teacher) return false;
  return teacher.assignedClasses.some(
    (c) => c.toString() === classId.toString()
  );
};

// @desc    Get assignments (filtered by role)
// @route   GET /api/v1/assignments
// @access  All authenticated
const getAssignments = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    class: classId,
    subject: subjectId,
    status,
    sortBy = 'dueDate',
    sortOrder = 'asc',
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  // Role-based filtering
  if (req.user.role === 'student') {
    // Students only see PUBLISHED assignments for their class
    const studentProfile = await Student.findOne({ user: req.user._id });
    if (!studentProfile || !studentProfile.class) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter.class = studentProfile.class;
    filter.status = 'published';
  } else if (req.user.role === 'teacher') {
    // Teachers see their own assignments for assigned classes
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (!teacherProfile) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter.teacher = teacherProfile._id;
  }

  // Additional filters
  if (classId) filter.class = classId;
  if (subjectId) filter.subject = subjectId;
  if (status && ['draft', 'published'].includes(status)) {
    filter.status = status;
  }

  const totalRecords = await Assignment.countDocuments(filter);

  const sort = {};
  sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

  const assignments = await Assignment.find(filter)
    .populate('class', 'name code')
    .populate('subject', 'name code')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    })
    .sort(sort)
    .skip(skip)
    .limit(limitNum);

  // Add isOverdue flag for each assignment
  const now = new Date();
  const enriched = assignments.map((a) => ({
    ...a.toObject(),
    isOverdue: a.status === 'published' && a.dueDate < now,
  }));

  res.status(200).json({
    success: true,
    message: 'Assignments retrieved successfully',
    data: enriched,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single assignment
// @route   GET /api/v1/assignments/:id
// @access  Authorized users
const getAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id)
    .populate('class', 'name code')
    .populate('subject', 'name code')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Students can only see published assignments for their class
  if (req.user.role === 'student') {
    if (assignment.status !== 'published') {
      throw ApiError.notFound('Assignment not found');
    }
    const studentProfile = await Student.findOne({ user: req.user._id });
    if (
      !studentProfile ||
      studentProfile.class.toString() !== assignment.class._id.toString()
    ) {
      throw ApiError.forbidden('You do not have access to this assignment');
    }
  }

  res.status(200).json({
    success: true,
    message: 'Assignment retrieved successfully',
    data: {
      ...assignment.toObject(),
      isOverdue:
        assignment.status === 'published' && assignment.dueDate < new Date(),
    },
  });
});

// @desc    Create assignment
// @route   POST /api/v1/assignments
// @access  Teacher, Admin
const createAssignment = asyncHandler(async (req, res) => {
  const {
    title,
    description,
    class: classId,
    subject: subjectId,
    dueDate,
    attachmentUrl,
    status,
  } = req.body;

  // Validate class
  const cls = await Class.findById(classId);
  if (!cls) {
    throw ApiError.badRequest('Class not found');
  }

  // Validate subject belongs to class
  const subject = await Subject.findById(subjectId);
  if (!subject) {
    throw ApiError.badRequest('Subject not found');
  }
  if (subject.class.toString() !== classId) {
    throw ApiError.badRequest('Subject does not belong to the selected class');
  }

  // Get teacher profile
  let teacherProfile;
  if (req.user.role === 'teacher') {
    teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (!teacherProfile) {
      throw ApiError.forbidden('Teacher profile not found');
    }

    // Check teacher is assigned to this class
    const isAssigned = teacherProfile.assignedClasses.some(
      (c) => c.toString() === classId
    );
    if (!isAssigned) {
      throw ApiError.forbidden('You are not assigned to this class');
    }
  } else {
    // Admin creating on behalf - still need a teacher reference
    teacherProfile = await Teacher.findById(subject.teacher);
    if (!teacherProfile) {
      throw ApiError.badRequest('No teacher assigned to this subject');
    }
  }

  // Validate due date is in the future
  if (new Date(dueDate) <= new Date()) {
    throw ApiError.badRequest('Due date must be in the future');
  }

  const assignment = await Assignment.create({
    title,
    description,
    class: classId,
    subject: subjectId,
    teacher: teacherProfile._id,
    dueDate,
    attachmentUrl: attachmentUrl || '',
    status: status || 'draft',
  });

  const populated = await Assignment.findById(assignment._id)
    .populate('class', 'name code')
    .populate('subject', 'name code')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(201).json({
    success: true,
    message: 'Assignment created successfully',
    data: populated,
  });
});

// @desc    Update assignment
// @route   PATCH /api/v1/assignments/:id
// @access  Teacher (own), Admin
const updateAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check teacher authorization
  if (req.user.role === 'teacher') {
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (
      !teacherProfile ||
      teacherProfile._id.toString() !== assignment.teacher.toString()
    ) {
      throw ApiError.forbidden('You can only edit your own assignments');
    }
  }

  const {
    title,
    description,
    class: classId,
    subject: subjectId,
    dueDate,
    attachmentUrl,
    status,
  } = req.body;

  // Validate class if changing
  if (classId) {
    const cls = await Class.findById(classId);
    if (!cls) throw ApiError.badRequest('Class not found');
    assignment.class = classId;
  }

  // Validate subject if changing
  if (subjectId) {
    const subject = await Subject.findById(subjectId);
    if (!subject) throw ApiError.badRequest('Subject not found');
    if (subject.class.toString() !== assignment.class.toString()) {
      throw ApiError.badRequest('Subject does not belong to the selected class');
    }
    assignment.subject = subjectId;
  }

  if (title) assignment.title = title;
  if (description) assignment.description = description;
  if (dueDate) assignment.dueDate = dueDate;
  if (attachmentUrl !== undefined) assignment.attachmentUrl = attachmentUrl;
  if (status) assignment.status = status;

  await assignment.save();

  const populated = await Assignment.findById(assignment._id)
    .populate('class', 'name code')
    .populate('subject', 'name code')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name email' },
    });

  res.status(200).json({
    success: true,
    message: 'Assignment updated successfully',
    data: populated,
  });
});

// @desc    Delete assignment
// @route   DELETE /api/v1/assignments/:id
// @access  Teacher (own), Admin
const deleteAssignment = asyncHandler(async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment) {
    throw ApiError.notFound('Assignment not found');
  }

  // Check teacher authorization
  if (req.user.role === 'teacher') {
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (
      !teacherProfile ||
      teacherProfile._id.toString() !== assignment.teacher.toString()
    ) {
      throw ApiError.forbidden('You can only delete your own assignments');
    }
  }

  await Assignment.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Assignment deleted successfully',
    data: null,
  });
});

module.exports = {
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
};