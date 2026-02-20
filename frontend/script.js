// frontend/script.js
const API_URL = 'http://localhost:5000/api';
let currentUser = null;
let technicians = [];

// Helper: Get JWT headers
const getHeaders = () => ({
  'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Show Section
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
  document.getElementById(id).style.display = 'block';
}

// Technician Form Hide/Show
function updateRegisterFormFields() {
  const role = document.getElementById('registerRole').value;
  const email = document.getElementById('registerEmail');
  const dept = document.getElementById('registerDept');

  if (role === 'technician') {
    email.style.display = 'none';
    dept.style.display = 'none';
    email.value = '';
    dept.value = '';
  } else {
    email.style.display = 'block';
    dept.style.display = 'block';
  }
}

// REGISTER (Fixed)
async function register() {
  const role = document.getElementById('registerRole').value;
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const dept = document.getElementById('registerDept').value.trim();
  const password = document.getElementById('registerPass').value;

  if (!name || !password) return alert('Name & password required');

  const body = { name, password, role };
  if (role !== 'technician') {
    if (!email || !dept) return alert('Email & department required');
    body.email = email;
    body.department = dept;
  }

  try {
    const res = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (res.ok) {
      alert('Registered! Please login.');
      showSection('loginSection');
    } else {
      alert(data.msg || 'Registration failed');
    }
  } catch (e) {
    alert('Network error');
  }
}

// LOGIN (Fixed)
async function login() {
  const role = document.getElementById('loginRole').value;
  const email = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;

  const body = { password, role };
  if (role !== 'technician') body.email = email;

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      currentUser = data.user;
      loadDashboard(data.user);
    } else {
      alert(data.msg || 'Login failed');
    }
  } catch (e) {
    alert('Network error');
  }
}

// Load Correct Dashboard
function loadDashboard(user) {
  if (user.role === 'admin') {
    showSection('adminSection');
    loadAdminPanel();
  } else if (user.role === 'technician') {
    showSection('techSection');
    loadTechPanel();
  } else {
    showSection('userComplaintSection');
    loadUserComplaints();
  }
}

// USER: Submit Complaint
async function submitComplaint() {
  const formData = new FormData();
  formData.append('category', document.getElementById('complaintCategory').value);
  formData.append('title', document.getElementById('complaintTitle').value);
  formData.append('description', document.getElementById('complaintDesc').value);
  const file = document.getElementById('complaintImage').files[0];
  if (file) formData.append('image', file);

  try {
    const res = await fetch(`${API_URL}/complaints`, {
      method: 'POST',
      headers: getHeaders(),
      body: formData
    });
    if (res.ok) {
      alert('Complaint submitted!');
      document.getElementById('complaintTitle').value = '';
      document.getElementById('complaintDesc').value = '';
      document.getElementById('complaintImage').value = '';
      loadUserComplaints();
    } else {
      const err = await res.json();
      alert(err.msg || 'Failed');
    }
  } catch (e) {
    alert('Network error');
  }
}

// USER: List Complaints
async function loadUserComplaints() {
  const user = JSON.parse(localStorage.getItem('user'));
  if (!user) return;

  try {
    const res = await fetch(`${API_URL}/complaints/user/${user.id}`, { headers: getHeaders() });
    const complaints = await res.json();

    const list = document.getElementById('complaintList');
    list.innerHTML = complaints.map(c => `
      <div class="complaint-card">
        <div class="status ${c.status.toLowerCase().replace(' ', '-')}">${c.status}</div>
        <b>${c.title}</b> (${c.category})<br>
        Assigned: ${c.assignedTo?.name || 'Unassigned'}<br>
        <p>${c.description}</p>
        ${c.imagePath ? `<img src="${c.imagePath}" width="100">` : ''}
        ${c.status === 'Resolved' ? `<button onclick="openFeedback('${c._id}')">Give Feedback</button>` : ''}
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

// Feedback Modal
function openFeedback(id) {
  window.currentComplaintId = id;
  document.getElementById('feedbackModal').style.display = 'flex';
}
function closeModal() {
  document.getElementById('feedbackModal').style.display = 'none';
}
async function submitFeedback() {
  const rating = document.getElementById('feedbackRating').value;
  const comments = document.getElementById('feedbackText').value;

  try {
    const res = await fetch(`${API_URL}/feedback`, {
      method: 'POST',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        complaintId: window.currentComplaintId,
        rating,
        comments
      })
    });
    if (res.ok) {
      alert('Feedback submitted!');
      closeModal();
      loadUserComplaints();
    }
  } catch (e) {
    alert('Failed');
  }
}

// ADMIN: Load Panel
async function loadAdminPanel() {
  try {
    const [techRes, compRes] = await Promise.all([
      fetch(`${API_URL}/technicians`, { headers: getHeaders() }),
      fetch(`${API_URL}/complaints`, { headers: getHeaders() })
    ]);
    technicians = await techRes.json();
    const complaints = await compRes.json();

    const container = document.getElementById('allComplaints');
    container.innerHTML = complaints.map(c => {
      const opts = technicians.map(t => 
        `<option value="${t._id}" ${c.assignedTo?._id === t._id ? 'selected' : ''}>${t.name}</option>`
      ).join('');

      return `
        <div class="complaint-card">
          <b>${c.title}</b> (${c.category})<br>
          By: ${c.userId?.name || 'Unknown'}<br>
          <p>${c.description}</p>
          ${c.imagePath ? `<img src="${c.imagePath}" width="100">` : ''}
          <br>
          Assign: 
          <select onchange="assignTech('${c._id}', this.value)">
            <option value="">Unassigned</option>
            ${opts}
          </select>
          <button onclick="setStatus('${c._id}', 'In Progress')">In Progress</button>
          <button onclick="setStatus('${c._id}', 'Resolved')">Resolve</button>
        </div>`;
    }).join('');

    generateReport();
  } catch (e) {
    console.error(e);
  }
}

// ADMIN: Assign Technician
async function assignTech(id, techId) {
  try {
    const res = await fetch(`${API_URL}/complaints/${id}/assign`, {
      method: 'PUT',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ technicianId: techId || null })
    });
    if (res.ok) {
      loadAdminPanel();
      loadUserComplaints();
    }
  } catch (e) {
    alert('Assign failed');
  }
}

// ADMIN: Update Status
async function setStatus(id, status) {
  const notes = status === 'Resolved' ? prompt('Repair notes:') : '';
  try {
    const res = await fetch(`${API_URL}/complaints/${id}/status`, {
      method: 'PUT',
      headers: { ...getHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, repairNotes: notes })
    });
    if (res.ok) {
      loadAdminPanel();
      loadUserComplaints();
      loadTechPanel();
    }
  } catch (e) {
    alert('Status update failed');
  }
}

// TECH: Load Assigned
async function loadTechPanel() {
  const user = JSON.parse(localStorage.getItem('user'));
  try {
    const res = await fetch(`${API_URL}/complaints/assigned/${user.id}`, { headers: getHeaders() });
    const complaints = await res.json();

    document.getElementById('assignedComplaints').innerHTML = complaints.map(c => `
      <div class="complaint-card">
        <b>${c.title}</b><br>
        <p>${c.description}</p>
        ${c.imagePath ? `<img src="${c.imagePath}" width="100">` : ''}
        <textarea id="note-${c._id}" placeholder="Repair notes"></textarea>
        <button onclick="techResolve('${c._id}')">Mark Resolved</button>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

// TECH: Resolve
window.techResolve = function(id) {
  const notes = document.getElementById(`note-${id}`).value;
  setStatus(id, 'Resolved');
  document.getElementById(`note-${id}`).value = '';
};

// REPORTS
async function generateReport() {
  try {
    const res = await fetch(`${API_URL}/reports`, { headers: getHeaders() });
    const d = await res.json();

    const ctx1 = document.createElement('canvas');
    ctx1.id = 'pieChart';
    document.getElementById('reports').innerHTML = '';
    document.getElementById('reports').appendChild(ctx1);

    new Chart(ctx1, {
      type: 'pie',
      data: {
        labels: ['Pending', 'In Progress', 'Resolved'],
        datasets: [{ data: [d.pending, d.inProgress, d.resolved], backgroundColor: ['#f57c00', '#fbc02d', '#66bb6a'] }]
      }
    });

    const avg = (d.avgResolutionTime / 3600000).toFixed(1);
    document.getElementById('reports').insertAdjacentHTML('beforeend', `<p><b>Avg Time:</b> ${avg} hrs</p>`);
  } catch (e) {
    console.error(e);
  }
}

// ON LOAD
window.onload = () => {
  updateRegisterFormFields();
  const user = localStorage.getItem('user');
  if (user) loadDashboard(JSON.parse(user));
};