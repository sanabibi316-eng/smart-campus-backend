const express = require('express');
const router = express.Router();
const {
  getClasses,
  getClass,
  createClass,
  updateClass,
  toggleClassStatus,
} = require('../controllers/classController');
const { protect, authorize } = require('../middleware/auth');
const {
  createClassValidation,
  updateClassValidation,
  mongoIdParam,
  statusValidation,
} = require('../middleware/validate');

router.use(protect);

router.get('/', getClasses);
router.post('/', authorize('admin'), createClassValidation, createClass);
router.get('/:id', mongoIdParam, getClass);
router.patch('/:id', authorize('admin'), mongoIdParam, updateClassValidation, updateClass);
router.patch('/:id/status', authorize('admin'), mongoIdParam, statusValidation, toggleClassStatus);

module.exports = router;