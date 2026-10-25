const express = require('express');
const router = express.Router();
const {
  markAttendance,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  getAttendanceReport,
  getClassDateAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');
const {
  createAttendanceValidation,
  updateAttendanceValidation,
  mongoIdParam,
} = require('../middleware/validate');

router.use(protect);

// Reports route must come BEFORE /:id to avoid conflict
router.get(
  '/reports',
  authorize('admin', 'teacher'),
  getAttendanceReport
);

// Get attendance for a specific class + date (for marking UI)
router.get(
  '/class-date',
  authorize('admin', 'teacher'),
  getClassDateAttendance
);

// CRUD routes
router.post(
  '/',
  authorize('admin', 'teacher'),
  createAttendanceValidation,
  markAttendance
);
router.get('/', getAttendance);
router.get('/:id', mongoIdParam, getAttendanceById);
router.patch(
  '/:id',
  authorize('admin', 'teacher'),
  mongoIdParam,
  updateAttendanceValidation,
  updateAttendance
);

module.exports = router;