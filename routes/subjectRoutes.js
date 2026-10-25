const express = require('express');
const router = express.Router();
const {
  getSubjects,
  getSubject,
  createSubject,
  updateSubject,
  toggleSubjectStatus,
} = require('../controllers/subjectController');
const { protect, authorize } = require('../middleware/auth');
const {
  createSubjectValidation,
  updateSubjectValidation,
  mongoIdParam,
  statusValidation,
} = require('../middleware/validate');

router.use(protect);

router.get('/', getSubjects);
router.post('/', authorize('admin'), createSubjectValidation, createSubject);
router.get('/:id', mongoIdParam, getSubject);
router.patch('/:id', authorize('admin'), mongoIdParam, updateSubjectValidation, updateSubject);
router.patch('/:id/status', authorize('admin'), mongoIdParam, statusValidation, toggleSubjectStatus);

module.exports = router;