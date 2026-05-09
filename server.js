const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Directories
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MESSAGES_FILE = path.join(__dirname, 'messages.json');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Default data structure
const DEFAULT_DATA = {
  hero: { videoPath: null, logoPath: null },
  about: { imagePath: null, p1: '', p2: '', p3: '', s1: '100+', s2: '6+', s3: '12' },
  internship: { imagePath: null },
  services: {},
  portfolio: {},
  news: {},
  internships: {},
  partners: {}
};

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
  console.log('📄 Created fresh data.json');
}

if (!fs.existsSync(MESSAGES_FILE)) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify({ contacts: [], internships: [] }, null, 2));
  console.log('📄 Created fresh messages.json');
}

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOAD_DIR));

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper functions
function readData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    console.error('Error reading data.json:', err);
    return DEFAULT_DATA;
  }
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function readMessages() {
  try {
    return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
  } catch (e) {
    return { contacts: [], internships: [] };
  }
}
function writeMessages(data) {
  fs.writeFileSync(MESSAGES_FILE, JSON.stringify(data, null, 2));
}

// ---------- MAIN DATA API ----------
app.get('/api/data', (req, res) => {
  const data = readData();
  console.log('📡 GET /api/data ->', Object.keys(data));
  res.json(data);
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const filePath = `/uploads/${req.file.filename}`;
  console.log(`📤 Uploaded: ${req.file.originalname} -> ${filePath}`);
  res.json({ path: filePath });
});

app.post('/api/save', (req, res) => {
  const { section, data, id } = req.body;
  if (!section || !data) return res.status(400).json({ error: 'Missing section or data' });
  const db = readData();
  if (!db[section]) db[section] = {};
  if (id !== undefined) {
    db[section][id] = { ...db[section][id], ...data };
    console.log(`💾 Saved ${section}[${id}]`);
  } else {
    Object.assign(db[section], data);
    console.log(`💾 Saved ${section} section`);
  }
  writeData(db);
  res.json({ ok: true });
});

app.delete('/api/item', (req, res) => {
  const { section, id } = req.query;
  if (!section || !id) return res.status(400).json({ error: 'Missing section or id' });
  const db = readData();
  if (db[section] && db[section][id]) {
    const item = db[section][id];
    ['imagePath', 'videoPath', 'logoPath'].forEach(field => {
      if (item[field] && item[field].startsWith('/uploads/')) {
        const fullPath = path.join(UPLOAD_DIR, path.basename(item[field]));
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
      }
    });
    delete db[section][id];
    writeData(db);
    console.log(`🗑️ Deleted ${section}[${id}]`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

app.patch('/api/toggle', (req, res) => {
  const { section, id, field, value } = req.query;
  if (!section || !id || !field) return res.status(400).json({ error: 'Missing params' });
  const db = readData();
  if (db[section] && db[section][id]) {
    let newValue = value;
    if (value === 'true') newValue = true;
    if (value === 'false') newValue = false;
    db[section][id][field] = newValue;
    writeData(db);
    console.log(`🔄 Toggled ${section}[${id}].${field} = ${newValue}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Item not found' });
  }
});

app.delete('/api/section', (req, res) => {
  const { section } = req.query;
  if (!section) return res.status(400).json({ error: 'Missing section' });
  const db = readData();
  if (db[section]) {
    const items = db[section];
    if (typeof items === 'object') {
      Object.values(items).forEach(item => {
        ['imagePath', 'videoPath', 'logoPath'].forEach(field => {
          if (item[field] && item[field].startsWith('/uploads/')) {
            const fullPath = path.join(UPLOAD_DIR, path.basename(item[field]));
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          }
        });
      });
    }
    db[section] = {};
    writeData(db);
    console.log(`🗑️ Cleared entire section: ${section}`);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Section not found' });
  }
});

// ---------- PARTNERS API (dedicated) ----------
app.post('/api/partners', upload.single('logo'), async (req, res) => {
  const { name, website } = req.body;
  if (!name) return res.status(400).json({ error: 'Partner name required' });
  const db = readData();
  if (!db.partners) db.partners = {};
  const id = Date.now().toString();
  let logoPath = null;
  if (req.file) logoPath = `/uploads/${req.file.filename}`;
  db.partners[id] = { name, website: website || '', logoPath, ts: Date.now() };
  writeData(db);
  res.json({ ok: true, id });
});

app.delete('/api/partners/:id', (req, res) => {
  const { id } = req.params;
  const db = readData();
  if (db.partners && db.partners[id]) {
    const logo = db.partners[id].logoPath;
    if (logo && logo.startsWith('/uploads/')) {
      const full = path.join(UPLOAD_DIR, path.basename(logo));
      if (fs.existsSync(full)) fs.unlinkSync(full);
    }
    delete db.partners[id];
    writeData(db);
    res.json({ ok: true });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

// ---------- CONTACT FORM (with optional PDF) ----------
app.post('/api/contactMessage', upload.single('attachment'), (req, res) => {
  const { name, email, phone, service, message } = req.body;
  if (!name || !email || !service || !message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const messages = readMessages();
  const attachmentPath = req.file ? `/uploads/${req.file.filename}` : null;
  messages.contacts.push({
    id: Date.now().toString(),
    type: 'contact',
    name, email, phone: phone || '', service, message,
    attachment: attachmentPath,
    date: new Date().toISOString(),
    read: false
  });
  writeMessages(messages);
  res.json({ ok: true });
});

// ---------- INTERNSHIP APPLICATION (full fields + 4 PDFs) ----------
const internshipUpload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).fields([
  { name: 'form', maxCount: 1 },
  { name: 'cv', maxCount: 1 },
  { name: 'id', maxCount: 1 },
  { name: 'academic', maxCount: 1 }
]);

app.post('/api/internshipApplication', (req, res) => {
  internshipUpload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'File upload error: ' + err.message });
    }

    const {
      name, dob, email, phone, gender, nationality, address,
      qualification, institution, yearCompleted, certifications,
      skills, experience, portfolioLink, motivation, availability,
      additionalInfo, ref1, ref2
    } = req.body;

    // Validate required fields
    if (!name || !email || !phone || !dob || !nationality || !address ||
        !qualification || !institution || !yearCompleted || !skills || !motivation || !availability) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const files = req.files;
    if (!files.cv || !files.id || !files.academic) {
      return res.status(400).json({ error: 'CV, ID, and Academic Record are required' });
    }

    const messages = readMessages();
    messages.internships.push({
      id: Date.now().toString(),
      type: 'internship',
      name, dob, email, phone, gender: gender || '', nationality, address,
      qualification, institution, yearCompleted, certifications: certifications || '',
      skills, experience: experience || '', portfolioLink: portfolioLink || '',
      motivation, availability, additionalInfo: additionalInfo || '',
      ref1: ref1 || '', ref2: ref2 || '',
      formPath: files.form ? `/uploads/${files.form[0].filename}` : null,
      cvPath: `/uploads/${files.cv[0].filename}`,
      idPath: `/uploads/${files.id[0].filename}`,
      academicPath: `/uploads/${files.academic[0].filename}`,
      date: new Date().toISOString(),
      read: false
    });

    writeMessages(messages);
    res.json({ ok: true });
  });
});

// ---------- ADMIN MESSAGES ENDPOINTS ----------
app.get('/api/messages', (req, res) => {
  res.json(readMessages());
});

app.delete('/api/message/:type/:id', (req, res) => {
  const { type, id } = req.params;
  if (type !== 'contact' && type !== 'internship') {
    return res.status(400).json({ error: 'Invalid type' });
  }
  const messages = readMessages();
  if (type === 'contact') {
    messages.contacts = messages.contacts.filter(m => m.id !== id);
  } else {
    messages.internships = messages.internships.filter(m => m.id !== id);
  }
  writeMessages(messages);
  res.json({ ok: true });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   NOKO ENTERTAINMENT STUDIO — Server     ║
  ╠══════════════════════════════════════════╣
  ║   Admin panel : http://localhost:${PORT}/Admin.html
  ║   Live site   : http://localhost:${PORT}/index.html
  ║   Data file   : ${DATA_FILE}
  ║   Messages    : ${MESSAGES_FILE}
  ║   Uploads     : ${UPLOAD_DIR}
  ╚══════════════════════════════════════════╝
  `);
});