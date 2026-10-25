const Attendance = require('../models/Attendance');
const Student = require('../models/Student');
const Class = require('../models/Class');
const Teacher = require('../models/Teacher');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { buildPaginationResponse, normalizeDate } = require('../utils/helpers');

// Helper: Check if teacher is assigned to a class
const isTeacherAssignedToClass = async (userId, classId) => {
  const teacher = await Teacher.findOne({ user: userId });
  if (!teacher) return false;
  return teacher.assignedClasses.some(
    (c) => c.toString() === classId.toString()
  );
};

// Helper: Calculate attendance percentage
// Policy: present + late = attended, absent = not attended, excused = excluded
const calculatePercentage = (records) => {
  let attended = 0;
  let total = 0;

  records.forEach((r) => {
    if (r.status === 'excused') return; // excluded from denominator
    total++;
    if (r.status === 'present' || r.status === 'late') {
      attended++;
    }
  });

  if (total === 0) return 0;
  return Math.round((attended / total) * 100 * 100) / 100; // 2 decimal places
};

// @desc    Mark attendance for a class on a date (bulk)
// @route   POST /api/v1/attendance
// @access  Admin, Assigned Teacher
const markAttendance = asyncHandler(async (req, res) => {
  const { classId, date, records } = req.body;

  // Validate class exists
  const cls = await Class.findById(classId);
  if (!cls) {
    throw ApiError.badRequest('Class not found');
  }

  // Check teacher authorization
  if (req.user.role === 'teacher') {
    const isAssigned = await isTeacherAssignedToClass(req.user._id, classId);
    if (!isAssigned) {
      throw ApiError.forbidden('You are not assigned to this class');
    }
  }

  // Normalize date to start of day
  const normalizedDate = normalizeDate(date);

  // Validate all students belong to the class
  const studentIds = records.map((r) => r.student);
  const studentsInClass = await Student.find({
    _id: { $in: studentIds },
    class: classId,
  });

  if (studentsInClass.length !== studentIds.length) {
    throw ApiError.badRequest('One or more students do not belong to this class');
  }

  // Build bulk operations (upsert to handle re-marking)
  const bulkOps = records.map((record) => ({
    updateOne: {
      filter: {
        student: record.student,
        class: classId,
        date: normalizedDate,
      },
      update: {
        $set: {
          status: record.status,
          recordedBy: req.user._id,
        },
        $setOnInsert: {
          student: record.student,
          class: classId,
          date: normalizedDate,
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(bulkOps);

  res.status(201).json({
    success: true,
    message: `Attendance saved for ${records.length} students`,
    data: {
      classId,
      date: normalizedDate,
      totalRecords: records.length,
      upserted: result.upsertedCount,
      modified: result.modifiedCount,
    },
  });
});

// @desc    Get attendance records (with filters)
// @route   GET /api/v1/attendance
// @access  Admin, Assigned Teacher, Student (own only)
const getAttendance = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    class: classId,
    student: studentId,
    date,
    status,
    startDate,
    endDate,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  const filter = {};

  // Role-based filtering
  if (req.user.role === 'student') {
    // Students can only see their own attendance
    const studentProfile = await Student.findOne({ user: req.user._id });
    if (!studentProfile) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter.student = studentProfile._id;
  } else if (req.user.role === 'teacher') {
    // Teachers can only see attendance for their assigned classes
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (!teacherProfile || teacherProfile.assignedClasses.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        pagination: buildPaginationResponse(pageNum, limitNum, 0),
      });
    }
    filter.class = { $in: teacherProfile.assignedClasses };
  }

  // Apply additional filters
  if (classId) filter.class = classId;
  if (studentId) filter.student = studentId;
  if (status && ['present', 'absent', 'late', 'excused'].includes(status)) {
    filter.status = status;
  }
  if (date) {
    const d = normalizeDate(date);
    const nextDay = new Date(d);
    nextDay.setDate(nextDay.getDate() + 1);
    filter.date = { $gte: d, $lt: nextDay };
  }
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = normalizeDate(startDate);
    if (endDate) {
      const end = normalizeDate(endDate);
      end.setDate(end.getDate() + 1);
      filter.date.$lt = end;
    }
  }

  const totalRecords = await Attendance.countDocuments(filter);

  const attendance = await Attendance.find(filter)
    .populate('student', 'studentId')
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    })
    .populate('class', 'name code')
    .populate('recordedBy', 'name email')
    .sort({ date: -1 })
    .skip(skip)
    .limit(limitNum);

  res.status(200).json({
    success: true,
    message: 'Attendance retrieved successfully',
    data: attendance,
    pagination: buildPaginationResponse(pageNum, limitNum, totalRecords),
  });
});

// @desc    Get single attendance record
// @route   GET /api/v1/attendance/:id
// @access  Authorized users
const getAttendanceById = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id)
    .populate('student', 'studentId')
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    })
    .populate('class', 'name code')
    .populate('recordedBy', 'name email');

  if (!record) {
    throw ApiError.notFound('Attendance record not found');
  }

  res.status(200).json({
    success: true,
    message: 'Attendance record retrieved',
    data: record,
  });
});

// @desc    Update single attendance record
// @route   PATCH /api/v1/attendance/:id
// @access  Admin, Assigned Teacher
const updateAttendance = asyncHandler(async (req, res) => {
  const { status } = req.body;

  const record = await Attendance.findById(req.params.id);
  if (!record) {
    throw ApiError.notFound('Attendance record not found');
  }

  // Check teacher authorization
  if (req.user.role === 'teacher') {
    const isAssigned = await isTeacherAssignedToClass(
      req.user._id,
      record.class
    );
    if (!isAssigned) {
      throw ApiError.forbidden('You are not assigned to this class');
    }
  }

  record.status = status;
  record.recordedBy = req.user._id;
  await record.save();

  const populated = await Attendance.findById(record._id)
    .populate('student', 'studentId')
    .populate({
      path: 'student',
      populate: { path: 'user', select: 'name email' },
    })
    .populate('class', 'name code')
    .populate('recordedBy', 'name email');

  res.status(200).json({
    success: true,
    message: 'Attendance updated successfully',
    data: populated,
  });
});

// @desc    Get attendance report/summary
// @route   GET /api/v1/attendance/reports
// @access  Admin, Assigned Teacher
const getAttendanceReport = asyncHandler(async (req, res) => {
  const {
    class: classId,
    student: studentId,
    startDate,
    endDate,
  } = req.query;

  const filter = {};

  // Role-based filtering
  if (req.user.role === 'teacher') {
    const teacherProfile = await Teacher.findOne({ user: req.user._id });
    if (!teacherProfile || teacherProfile.assignedClasses.length === 0) {
      return res.status(200).json({
        success: true,
        data: { summary: [], overallPercentage: 0 },
      });
    }
    filter.class = { $in: teacherProfile.assignedClasses };
  }

  if (classId) filter.class = classId;
  if (studentId) filter.student = studentId;

  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = normalizeDate(startDate);
    if (endDate) {
      const end = normalizeDate(endDate);
      end.setDate(end.getDate() + 1);
      filter.date.$lt = end;
    }
  }

  // Aggregate attendance by student
  const summary = await Attendance.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$student',
        totalDays: {
          $sum: {
            $cond: [{ $eq: ['$status', 'excused'] }, 0, 1],
          },
        },
        presentDays: {
          $sum: {
            $cond: [
              { $in: ['$status', ['present', 'late']] },
              1,
              0,
            ],
          },
        },
        absentDays: {
          $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] },
        },
        lateDays: {
          $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] },
        },
        excusedDays: {
          $sum: { $cond: [{ $eq: ['$status', 'excused'] }, 1, 0] },
        },
      },
    },
    {
      $addFields: {
        percentage: {
          $cond: [
            { $eq: ['$totalDays', 0] },
            0,
            {
              $round: [
                { $multiply: [{ $divide: ['$presentDays', '$totalDays'] }, 100] },
                2,
              ],
            },
          ],
        },
      },
    },
    { $sort: { percentage: -1 } },
  ]);

  // Populate student info
  const populatedSummary = await Promise.all(
    summary.map(async (item) => {
      const student = await Student.findById(item._id)
        .populate('user', 'name email')
        .populate('class', 'name code');
      return {
        ...item,
        student,
      };
    })
  );

  // Calculate overall percentage
  const allRecords = await Attendance.find(filter);
  const overallPercentage = calculatePercentage(allRecords);

  res.status(200).json({
    success: true,
    message: 'Attendance report retrieved',
    data: {
      summary: populatedSummary,
      overallPercentage,
      totalRecords: allRecords.length,
    },
  });
});

// @desc    Get attendance for a specific class on a specific date
// @route   GET /api/v1/attendance/class-date
// @access  Admin, Assigned Teacher
const getClassDateAttendance = asyncHandler(async (req, res) => {
  const { classId, date } = req.query;

  if (!classId || !date) {
    throw ApiError.badRequest('classId and date are required');
  }

  const normalizedDate = normalizeDate(date);
  const nextDay = new Date(normalizedDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Check teacher authorization
  if (req.user.role === 'teacher') {
    const isAssigned = await isTeacherAssignedToClass(req.user._id, classId);
    if (!isAssigned) {
      throw ApiError.forbidden('You are not assigned to this class');
    }
  }

  // Get all active students in the class
  const students = await Student.find({ class: classId, status: 'active' })
    .populate('user', 'name email')
    .sort({ 'user.name': 1 });

  // Get existing attendance for this date
  const attendance = await Attendance.find({
    class: classId,
    date: { $gte: normalizedDate, $lt: nextDay },
  }).populate('recordedBy', 'name');

  // Merge: each student with their attendance status (or 'unmarked')
  const attendanceMap = {};
  attendance.forEach((a) => {
    attendanceMap[a.student.toString()] = a;
  });

  const result = students.map((student) => {
    const record = attendanceMap[student._id.toString()];
    return {
      student: {
        _id: student._id,
        studentId: student.studentId,
        name: student.user?.name,
        email: student.user?.email,
      },
      status: record ? record.status : 'unmarked',
      recordId: record ? record._id : null,
    };
  });

  res.status(200).json({
    success: true,
    message: 'Class attendance retrieved',
    data: {
      classId,
      date: normalizedDate,
      totalStudents: students.length,
      markedCount: attendance.length,
      unmarkedCount: students.length - attendance.length,
      records: result,
    },
  });
});

module.exports = {
  markAttendance,
  getAttendance,
  getAttendanceById,
  updateAttendance,
  getAttendanceReport,
  getClassDateAttendance,
};