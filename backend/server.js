// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer for image upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/complaintDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB Error:', err));

// --- MODELS ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true }, // sparse = allow null
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['student', 'faculty', 'technician', 'admin'], 
    default: 'student' 
  },
  department: String
});

const complaintSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  category: String,
  title: String,
  description: String,
  imagePath: String,
  status: { type: String, enum: ['Pending', 'In Progress', 'Resolved'], default: 'Pending' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  repairNotes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: Date
});

const feedbackSchema = new mongoose.Schema({
  complaintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Complaint' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rating: { type: Number, min: 1, max: 5 },
  comments: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Complaint = mongoose.model('Complaint', complaintSchema);
const Feedback = mongoose.model('Feedback', feedbackSchema);

// --- JWT AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Invalid token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Access denied' });
    }
    next();
  };
};

// --- ROUTES ---

// 1. REGISTER – FIXED: NO "namename"
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, role, department } = req.body;

  // BLOCK ADMIN
  if (role === 'admin') {
    return res.status(403).json({ msg: 'Admin cannot be registered. Use seed-admin.js script.' });
  }

  // VALIDATE TECHNICIAN
  if (role === 'technician') {
    if (!name || !password) {
      return res.status(400).json({ msg: 'Name and password required for technician' });
    }
  } else {
    if (!name || !email || !password || !department) {
      return res.status(400).json({ msg: 'All fields required' });
    }
  }

  try {
    // Check email only if not technician
    if (role !== 'technician' && await User.findOne({ email })) {
      return res.status(400).json({ msg: 'Email already exists' });
    }

    const hashed = await bcrypt.hash(password, 10);
    
    const user = new User({
      name,  // ← FIXED: was "namename"
      email: role === 'technician' ? undefined : email,
      password: hashed,
      role,
      department: role === 'technician' ? undefined : department
    });

    await user.save();

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { id: user._id, name, email: user.email || null, role } 
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ msg: 'Server error: ' + err.message });
  }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password, role } = req.body;
  try {
    let query = { role };
    if (role !== 'technician') query.email = email;

    const user = await User.findOne(query);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ msg: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role } });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 3. Submit Complaint
app.post('/api/complaints', authenticate, upload.single('image'), async (req, res) => {
  try {
    const complaint = new Complaint({
      userId: req.user.id,
      category: req.body.category,
      title: req.body.title,
      description: req.body.description,
      imagePath: req.file ? `/uploads/${req.file.filename}` : null
    });
    await complaint.save();
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 4. Get User's Complaints
app.get('/api/complaints/user/:userId', authenticate, async (req, res) => {
  try {
    const complaints = await Complaint.find({ userId: req.params.userId })
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 5. Get All Complaints (Admin)
app.get('/api/complaints', authenticate, authorize('admin'), async (req, res) => {
  try {
    const complaints = await Complaint.find()
      .populate('userId', 'name email')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 6. Assign Technician
app.put('/api/complaints/:id/assign', authenticate, authorize('admin'), async (req, res) => {
  try {
    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { assignedTo: req.body.technicianId || null, status: 'In Progress', updatedAt: Date.now() },
      { new: true }
    ).populate('assignedTo', 'name');
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 7. Update Status (Admin/Tech)
app.put('/api/complaints/:id/status', authenticate, authorize('admin', 'technician'), async (req, res) => {
  try {
    const update = { status: req.body.status, updatedAt: Date.now() };
    if (req.body.repairNotes) update.repairNotes = req.body.repairNotes;
    const complaint = await Complaint.findByIdAndUpdate(req.params.id, update, { new: true });
    res.json(complaint);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 8. Get Assigned Complaints (Technician)
app.get('/api/complaints/assigned/:techId', authenticate, authorize('technician'), async (req, res) => {
  try {
    const complaints = await Complaint.find({
      assignedTo: req.params.techId,
      status: { $in: ['In Progress', 'Pending'] }
    }).populate('userId', 'name');
    res.json(complaints);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 9. Submit Feedback
app.post('/api/feedback', authenticate, async (req, res) => {
  try {
    const feedback = new Feedback({
      complaintId: req.body.complaintId,
      userId: req.user.id,
      rating: req.body.rating,
      comments: req.body.comments
    });
    await feedback.save();
    res.json(feedback);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 10. Reports (Admin)
app.get('/api/reports', authenticate, authorize('admin'), async (req, res) => {
  try {
    const [total, pending, inProgress, resolved, deptStats, avgTime] = await Promise.all([
      Complaint.countDocuments(),
      Complaint.countDocuments({ status: 'Pending' }),
      Complaint.countDocuments({ status: 'In Progress' }),
      Complaint.countDocuments({ status: 'Resolved' }),
      Complaint.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      Complaint.aggregate([
        { $match: { status: 'Resolved' } },
        {
          $group: {
            _id: null,
            avgTime: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
          }
        }
      ])
    ]);

    res.json({
      total,
      pending,
      inProgress,
      resolved,
      deptStats,
      avgResolutionTime: avgTime[0]?.avgTime || 0
    });
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// 11. Get Technicians List
app.get('/api/technicians', authenticate, async (req, res) => {
  try {
    const techs = await User.find({ role: 'technician' }).select('name _id');
    res.json(techs);
  } catch (err) {
    res.status(500).json({ msg: 'Server error' });
  }
});

// --- SERVE FRONTEND ---
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});