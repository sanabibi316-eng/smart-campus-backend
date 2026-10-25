const { validationResult, body, param, query } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Run validation and collect errors
const runValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map((err) => err.msg);
    throw ApiError.badRequest('Validation failed', extractedErrors);
  }
  next();
};

// ==================== AUTH VALIDATIONS ====================
const loginValidation = [
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  runValidation,
];

const changePasswordValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .notEmpty()
    .withMessage('New password is required')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters'),
  runValidation,
];

// ==================== STUDENT VALIDATIONS ====================
const createStudentValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('studentId')
    .notEmpty()
    .withMessage('Student ID is required')
    .trim(),
  body('class')
    .notEmpty()
    .withMessage('Class is required')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('phone').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date of birth'),
  body('address').optional().trim(),
  body('admissionDate').optional().isISO8601().withMessage('Invalid admission date'),
  runValidation,
];

const updateStudentValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('class')
    .optional()
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('phone').optional().trim(),
  body('dateOfBirth').optional().isISO8601().withMessage('Invalid date of birth'),
  body('address').optional().trim(),
  runValidation,
];

// ==================== TEACHER VALIDATIONS ====================
const createTeacherValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters'),
  body('teacherId')
    .notEmpty()
    .withMessage('Teacher ID is required')
    .trim(),
  body('phone').optional().trim(),
  body('specialization').optional().trim(),
  body('joiningDate').optional().isISO8601().withMessage('Invalid joining date'),
  runValidation,
];

const updateTeacherValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Name cannot exceed 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
    .normalizeEmail(),
  body('phone').optional().trim(),
  body('specialization').optional().trim(),
  runValidation,
];

// ==================== CLASS VALIDATIONS ====================
const createClassValidation = [
  body('name').notEmpty().withMessage('Class name is required').trim(),
  body('code').notEmpty().withMessage('Class code is required').trim(),
  body('academicYear')
    .notEmpty()
    .withMessage('Academic year is required')
    .trim(),
  body('classTeacher')
    .optional()
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('description').optional().trim(),
  runValidation,
];

const updateClassValidation = [
  body('name').optional().trim(),
  body('code').optional().trim(),
  body('academicYear').optional().trim(),
  body('classTeacher')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('description').optional().trim(),
  runValidation,
];

// ==================== SUBJECT VALIDATIONS ====================
const createSubjectValidation = [
  body('name').notEmpty().withMessage('Subject name is required').trim(),
  body('code').notEmpty().withMessage('Subject code is required').trim(),
  body('class')
    .notEmpty()
    .withMessage('Class is required')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('teacher')
    .optional()
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('description').optional().trim(),
  runValidation,
];

const updateSubjectValidation = [
  body('name').optional().trim(),
  body('code').optional().trim(),
  body('class')
    .optional()
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('teacher')
    .optional({ values: 'null' })
    .isMongoId()
    .withMessage('Invalid teacher ID'),
  body('description').optional().trim(),
  runValidation,
];

// ==================== ATTENDANCE VALIDATIONS ====================
const createAttendanceValidation = [
  body('classId')
    .notEmpty()
    .withMessage('Class is required')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Invalid date format'),
  body('records')
    .isArray({ min: 1 })
    .withMessage('Attendance records are required'),
  body('records.*.student')
    .notEmpty()
    .withMessage('Student ID is required')
    .isMongoId()
    .withMessage('Invalid student ID'),
  body('records.*.status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['present', 'absent', 'late', 'excused'])
    .withMessage('Status must be present, absent, late, or excused'),
  runValidation,
];

const updateAttendanceValidation = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['present', 'absent', 'late', 'excused'])
    .withMessage('Status must be present, absent, late, or excused'),
  runValidation,
];

// ==================== ASSIGNMENT VALIDATIONS ====================
const createAssignmentValidation = [
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description')
    .notEmpty()
    .withMessage('Description is required')
    .trim(),
  body('class')
    .notEmpty()
    .withMessage('Class is required')
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('subject')
    .notEmpty()
    .withMessage('Subject is required')
    .isMongoId()
    .withMessage('Invalid subject ID'),
  body('dueDate')
    .notEmpty()
    .withMessage('Due date is required')
    .isISO8601()
    .withMessage('Invalid due date'),
  body('attachmentUrl').optional().trim(),
  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be draft or published'),
  runValidation,
];

const updateAssignmentValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title cannot exceed 200 characters'),
  body('description').optional().trim(),
  body('class')
    .optional()
    .isMongoId()
    .withMessage('Invalid class ID'),
  body('subject')
    .optional()
    .isMongoId()
    .withMessage('Invalid subject ID'),
  body('dueDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid due date'),
  body('attachmentUrl').optional().trim(),
  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be draft or published'),
  runValidation,
];

// ==================== COMMON VALIDATIONS ====================
const mongoIdParam = [
  param('id').isMongoId().withMessage('Invalid ID format'),
  runValidation,
];

const statusValidation = [
  body('status')
    .notEmpty()
    .withMessage('Status is required')
    .isIn(['active', 'inactive'])
    .withMessage('Status must be active or inactive'),
  runValidation,
];

module.exports = {
  loginValidation,
  changePasswordValidation,
  createStudentValidation,
  updateStudentValidation,
  createTeacherValidation,
  updateTeacherValidation,
  createClassValidation,
  updateClassValidation,
  createSubjectValidation,
  updateSubjectValidation,
  createAttendanceValidation,
  updateAttendanceValidation,
  createAssignmentValidation,
  updateAssignmentValidation,
  mongoIdParam,
  statusValidation,
};