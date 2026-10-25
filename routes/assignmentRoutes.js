const express = require('express');
const router = express.Router();
const {
  getAssignments,
  getAssignment,
  createAssignment,
  updateAssignment,
  deleteAssignment,
} = require('../controllers/assignmentController');
const { protect, authorize } = require('../middleware/auth');
const {
  createAssignmentValidation,
  updateAssignmentValidation,
  mongoIdParam,
} = require('../middleware/validate');

router.use(protect);

router.get('/', getAssignments);
router.post(
  '/',
  authorize('admin', 'teacher'),
  createAssignmentValidation,
  createAssignment
);
router.get('/:id', mongoIdParam, getAssignment);
router.patch(
  '/:id',
  authorize('admin', 'teacher'),
  mongoIdParam,
  updateAssignmentValidation,
  updateAssignment
);
router.delete(
  '/:id',
  authorize('admin', 'teacher'),
  mongoIdParam,
  deleteAssignment
);

module.exports = router;