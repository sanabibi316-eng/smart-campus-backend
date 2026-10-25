const express = require('express');
const router = express.Router();
const {
  getStudents,
  getStudent,
  createStudent,
  updateStudent,
  toggleStudentStatus,
  getMyProfile,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');
const {
  createStudentValidation,
  updateStudentValidation,
  mongoIdParam,
  statusValidation,
} = require('../middleware/validate');

// All routes require authentication
router.use(protect);

// Student can view own profile
router.get('/me', authorize('student'), getMyProfile);

// Admin routes
router.get('/', authorize('admin'), getStudents);
router.post('/', authorize('admin'), createStudentValidation, createStudent);
router.get('/:id', authorize('admin', 'student'), mongoIdParam, getStudent);
router.patch('/:id', authorize('admin'), mongoIdParam, updateStudentValidation, updateStudent);
router.patch('/:id/status', authorize('admin'), mongoIdParam, statusValidation, toggleStudentStatus);

module.exports = router;