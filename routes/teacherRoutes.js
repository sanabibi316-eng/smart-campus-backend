const express = require('express');
const router = express.Router();
const {
  getTeachers,
  getTeacher,
  createTeacher,
  updateTeacher,
  toggleTeacherStatus,
  getMyProfile,
} = require('../controllers/teacherController');
const { protect, authorize } = require('../middleware/auth');
const {
  createTeacherValidation,
  updateTeacherValidation,
  mongoIdParam,
  statusValidation,
} = require('../middleware/validate');

router.use(protect);

router.get('/me', authorize('teacher'), getMyProfile);
router.get('/', authorize('admin'), getTeachers);
router.post('/', authorize('admin'), createTeacherValidation, createTeacher);
router.get('/:id', authorize('admin', 'teacher'), mongoIdParam, getTeacher);
router.patch('/:id', authorize('admin'), mongoIdParam, updateTeacherValidation, updateTeacher);
router.patch('/:id/status', authorize('admin'), mongoIdParam, statusValidation, toggleTeacherStatus);

module.exports = router;