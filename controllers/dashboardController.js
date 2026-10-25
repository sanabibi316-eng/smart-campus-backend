const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const Assignment = require('../models/Assignment');
const asyncHandler = require('../utils/asyncHandler');
const { normalizeDate } = require('../utils/helpers');

// @desc    Admin dashboard statistics
// @route   GET /api/v1/dashboard/admin
// @access  Admin
const getAdminDashboard = asyncHandler(async (req, res) => {
  // Run all counts in parallel for performance
  const [
    totalStudents,
    totalTeachers,
    totalClasses,
    totalSubjects,
    activeStudents,
    activeTeachers,
  ] = await Promise.all([
    Student.countDocuments(),
    Teacher.countDocuments(),
    Class.countDocuments(),
    Subject.countDocuments(),
    Student.countDocuments({ status: 'active' }),
    Teacher.countDocuments({ status: 'active' }),
  ]);

  // Today's attendance
  const today = normalizeDate(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [todayPresent, todayAbsent, todayLate, todayExcused] =
    await Promise.all([
      Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        status: 'present',
      }),
      Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        status: 'absent',
      }),
      Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        status: 'late',
      }),
      Attendance.countDocuments({
        date: { $gte: today, $lt: tomorrow },
        status: 'excused',
      }),
    ]);

  const todayTotal = todayPresent + todayAbsent + todayLate + todayExcused;
  const todayAttended = todayPresent + todayLate;
  const todayPercentage =
    todayTotal > 0
      ? Math.round((todayAttended / (todayTotal - todayExcused)) * 100 * 100) / 100
      : 0;

  // Overall attendance percentage (last 30 days)
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentAttendance = await Attendance.find({
    date: { $gte: thirtyDaysAgo },
  });

  let overallAttended = 0;
  let overallTotal = 0;
  recentAttendance.forEach((r) => {
    if (r.status === 'excused') return;
    overallTotal++;
    if (r.status === 'present' || r.status === 'late') overallAttended++;
  });
  const overallPercentage =
    overallTotal > 0
      ? Math.round((overallAttended / overallTotal) * 100 * 100) / 100
      : 0;

  // Recent students (last 5)
  const recentStudents = await Student.find()
    .populate('user', 'name email')
    .populate('class', 'name code')
    .sort({ createdAt: -1 })
    .limit(5);

  // Recent teachers (last 5)
  const recentTeachers = await Teacher.find()
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(5);

  // Recent assignments (last 5)
  const recentAssignments = await Assignment.find()
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ createdAt: -1 })
    .limit(5);

  // Student distribution by class (for chart)
  const classDistribution = await Student.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: '$class',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  // Populate class names
  const populatedDistribution = await Promise.all(
    classDistribution.map(async (item) => {
      const cls = await Class.findById(item._id).select('name code');
      return {
        className: cls ? cls.name : 'Unassigned',
        count: item.count,
      };
    })
  );

  // Attendance trend (last 7 days)
  const attendanceTrend = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const nextD = new Date(d);
    nextD.setDate(nextD.getDate() + 1);

    const dayRecords = await Attendance.find({
      date: { $gte: d, $lt: nextD },
    });

    let dayAttended = 0;
    let dayTotal = 0;
    dayRecords.forEach((r) => {
      if (r.status === 'excused') return;
      dayTotal++;
      if (r.status === 'present' || r.status === 'late') dayAttended++;
    });

    attendanceTrend.push({
      date: d.toISOString().split('T')[0],
      percentage: dayTotal > 0 ? Math.round((dayAttended / dayTotal) * 100) : 0,
      total: dayTotal,
    });
  }

  res.status(200).json({
    success: true,
    message: 'Admin dashboard retrieved',
    data: {
      stats: {
        totalStudents,
        totalTeachers,
        totalClasses,
        totalSubjects,
        activeStudents,
        activeTeachers,
      },
      attendance: {
        today: {
          present: todayPresent,
          absent: todayAbsent,
          late: todayLate,
          excused: todayExcused,
          total: todayTotal,
          percentage: todayPercentage,
        },
        overall30Days: overallPercentage,
      },
      recentStudents,
      recentTeachers,
      recentAssignments,
      charts: {
        classDistribution: populatedDistribution,
        attendanceTrend,
      },
    },
  });
});

// @desc    Teacher dashboard statistics
// @route   GET /api/v1/dashboard/teacher
// @access  Teacher
const getTeacherDashboard = asyncHandler(async (req, res) => {
  const teacherProfile = await Teacher.findOne({ user: req.user._id })
    .populate('assignedClasses', 'name code academicYear');

  if (!teacherProfile) {
    return res.status(200).json({
      success: true,
      data: {
        assignedClasses: [],
        totalStudents: 0,
        todayAttendance: null,
        upcomingAssignments: [],
        recentAssignments: [],
      },
    });
  }

  const classIds = teacherProfile.assignedClasses.map((c) => c._id);

  // Count students in assigned classes
  const totalStudents = await Student.countDocuments({
    class: { $in: classIds },
    status: 'active',
  });

  // Today's attendance for assigned classes
  const today = normalizeDate(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRecords = await Attendance.find({
    class: { $in: classIds },
    date: { $gte: today, $lt: tomorrow },
  });

  let todayPresent = 0;
  let todayAbsent = 0;
  let todayLate = 0;
  todayRecords.forEach((r) => {
    if (r.status === 'present') todayPresent++;
    else if (r.status === 'absent') todayAbsent++;
    else if (r.status === 'late') todayLate++;
  });

  // Upcoming assignments (due in next 7 days)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const upcomingAssignments = await Assignment.find({
    teacher: teacherProfile._id,
    status: 'published',
    dueDate: { $gte: today, $lte: nextWeek },
  })
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ dueDate: 1 })
    .limit(5);

  // Recent assignments
  const recentAssignments = await Assignment.find({
    teacher: teacherProfile._id,
  })
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ createdAt: -1 })
    .limit(5);

  res.status(200).json({
    success: true,
    message: 'Teacher dashboard retrieved',
    data: {
      assignedClasses: teacherProfile.assignedClasses,
      totalStudents,
      todayAttendance: {
        present: todayPresent,
        absent: todayAbsent,
        late: todayLate,
        totalMarked: todayRecords.length,
      },
      upcomingAssignments,
      recentAssignments,
    },
  });
});

// @desc    Student dashboard statistics
// @route   GET /api/v1/dashboard/student
// @access  Student
const getStudentDashboard = asyncHandler(async (req, res) => {
  const studentProfile = await Student.findOne({ user: req.user._id })
    .populate('user', 'name email')
    .populate('class', 'name code academicYear');

  if (!studentProfile) {
    return res.status(200).json({
      success: true,
      data: {
        profile: null,
        attendance: { percentage: 0, recent: [] },
        upcomingAssignments: [],
      },
    });
  }

  // Calculate overall attendance percentage
  const allAttendance = await Attendance.find({
    student: studentProfile._id,
  }).sort({ date: -1 });

  let attended = 0;
  let total = 0;
  allAttendance.forEach((r) => {
    if (r.status === 'excused') return;
    total++;
    if (r.status === 'present' || r.status === 'late') attended++;
  });

  const percentage =
    total > 0 ? Math.round((attended / total) * 100 * 100) / 100 : 0;

  // Recent attendance (last 10)
  const recentAttendance = allAttendance.slice(0, 10).map((r) => ({
    date: r.date,
    status: r.status,
  }));

  // Upcoming assignments for student's class
  const today = normalizeDate(new Date());
  const upcomingAssignments = await Assignment.find({
    class: studentProfile.class?._id,
    status: 'published',
    dueDate: { $gte: today },
  })
    .populate('subject', 'name code')
    .populate({
      path: 'teacher',
      populate: { path: 'user', select: 'name' },
    })
    .sort({ dueDate: 1 })
    .limit(5);

  // Overdue assignments
  const overdueAssignments = await Assignment.find({
    class: studentProfile.class?._id,
    status: 'published',
    dueDate: { $lt: today },
  })
    .populate('subject', 'name code')
    .sort({ dueDate: -1 })
    .limit(3);

  res.status(200).json({
    success: true,
    message: 'Student dashboard retrieved',
    data: {
      profile: {
        name: studentProfile.user?.name,
        email: studentProfile.user?.email,
        studentId: studentProfile.studentId,
        className: studentProfile.class?.name,
        classCode: studentProfile.class?.code,
        academicYear: studentProfile.class?.academicYear,
      },
      attendance: {
        percentage,
        totalDays: total,
        attendedDays: attended,
        recent: recentAttendance,
      },
      upcomingAssignments: upcomingAssignments.map((a) => ({
        _id: a._id,
        title: a.title,
        subject: a.subject?.name,
        teacherName: a.teacher?.user?.name,
        dueDate: a.dueDate,
        daysLeft: Math.ceil(
          (a.dueDate - new Date()) / (1000 * 60 * 60 * 24)
        ),
      })),
      overdueAssignments: overdueAssignments.map((a) => ({
        _id: a._id,
        title: a.title,
        subject: a.subject?.name,
        dueDate: a.dueDate,
        daysOverdue: Math.ceil(
          (new Date() - a.dueDate) / (1000 * 60 * 60 * 24)
        ),
      })),
    },
  });
});

module.exports = {
  getAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
};