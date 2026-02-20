// backend/seed-admin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'faculty', 'technician', 'admin'] },
  department: String
});

const User = mongoose.model('User', userSchema);

mongoose.connect('mongodb://localhost:27017/complaintDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    console.log('Seeding database...');

    // ADMIN
    const adminData = { email: 'admin@campus.com', name: 'Facility Manager', role: 'admin', password: 'admin123', department: 'Facility' };
    if (!await User.findOne({ email: adminData.email })) {
      const hashed = await bcrypt.hash(adminData.password, 10);
      await new User({ ...adminData, password: hashed }).save();
      console.log('Admin created: admin@campus.com / admin123');
    }

    // 2 TECHNICIANS
    const techs = [
      { name: 'Mike Tech', email: 'mike@tech.com', role: 'technician', password: 'tech123' },
      { name: 'Sarah Fix', email: 'sarah@tech.com', role: 'technician', password: 'tech123' }
    ];

    for (const t of techs) {
      if (!await User.findOne({ email: t.email })) {
        const hashed = await bcrypt.hash(t.password, 10);
        await new User({ ...t, password: hashed }).save();
        console.log(`Technician: ${t.name} (${t.email})`);
      }
    }

    console.log('Seed complete!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
  });