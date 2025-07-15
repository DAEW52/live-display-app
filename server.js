// --- 1. เรียกใช้งานโปรแกรมเสริม ---
const express = require('express');
const multer = require('multer');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const { Pool } = require('pg');

// --- 2. ตั้งค่าพื้นฐาน ---
const app = express();
const port = 3000;
const httpServer = http.createServer(app);
const io = new Server(httpServer);

// --- 3. ส่วนเชื่อมต่อฐานข้อมูล (แก้ไขแล้ว) ---
const pool = new Pool({
    connectionString: 'postgresql://postgres:Daew132546@db.eqswytmbjsswzpzrhkhc.supabase.co:5432/postgres',
    ssl: {
        rejectUnauthorized: false
    }
});

const initializeDatabase = async () => {
    const createTableQuery = `
    CREATE TABLE IF NOT EXISTS submissions (
        id SERIAL PRIMARY KEY, "tableNumber" TEXT, "socialMedia" TEXT,
        "socialIcon" TEXT, message TEXT, "imagePath" TEXT,
        status TEXT DEFAULT 'pending', "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );`;
    try {
        await pool.query(createTableQuery);
        console.log('✅ ตรวจสอบตารางฐานข้อมูลเรียบร้อย');
    } catch (err) {
        console.error('เกิดข้อผิดพลาดในการสร้างตาราง:', err);
    }
};

// --- 4. Middleware ---
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const storage = multer.diskStorage({
    destination: './uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// --- 5. Routing (จัดการเส้นทาง) ---
app.post('/submit', upload.single('imageUpload'), async (req, res) => {
    const { tableNumber, socialMedia, socialIcon, message } = req.body;
    if (!req.file) { return res.status(400).json({ message: 'กรุณาเลือกรูปภาพ' }); }
    const imagePath = req.file.path;
    const sql = `INSERT INTO submissions ("tableNumber", "socialMedia", "socialIcon", message, "imagePath") VALUES ($1, $2, $3, $4, $5)`;
    try {
        await pool.query(sql, [tableNumber, socialMedia, socialIcon, message, imagePath]);
        res.json({ message: 'ได้รับข้อมูลเรียบร้อย' });
    } catch (err) {
        console.error('Error on /submit:', err);
        res.status(500).json({ message: err.message });
    }
});

app.get('/admin/pending', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM submissions WHERE status = $1 ORDER BY "createdAt" DESC', ['pending']);
        res.json(result.rows);
    } catch (err) {
        console.error('Error on /admin/pending:', err);
        res.status(500).json({ message: err.message });
    }
});

// **เส้นทาง /approved ที่หายไป จะต้องมีอยู่ตรงนี้**
app.get('/admin/approved', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM submissions WHERE status = $1 ORDER BY "createdAt" DESC', ['approved']);
        res.json(result.rows);
    } catch (err) {
        console.error('Error on /admin/approved:', err);
        res.status(500).json({ message: err.message });
    }
});

// **โค้ดที่ถูกต้องสำหรับ /approved ที่ใช้ใน display.html**
app.get('/approved', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM submissions WHERE status = $1 ORDER BY "createdAt" DESC', ['approved']);
        res.json(result.rows);
    } catch (err) {
        console.error('Error on /approved:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/admin/approve/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const findResult = await pool.query('SELECT * FROM submissions WHERE id = $1', [id]);
        if (findResult.rows.length === 0) { return res.status(404).json({ message: 'ไม่พบรายการ' }); }
        const approvedItem = findResult.rows[0];
        await pool.query('UPDATE submissions SET status = $1 WHERE id = $2', ['approved', id]);
        io.emit('new_submission', approvedItem);
        res.json({ message: 'อนุมัติสำเร็จ' });
    } catch (err) {
        console.error('Error on /admin/approve:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/admin/reject/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query('DELETE FROM submissions WHERE id = $1', [id]);
        res.json({ message: 'ลบรายการสำเร็จ' });
    } catch (err) {
        console.error('Error on /admin/reject:', err);
        res.status(500).json({ message: err.message });
    }
});

app.post('/admin/clear_today', async (req, res) => {
    const sql = `DELETE FROM submissions WHERE "createdAt"::date = CURRENT_DATE`;
    try {
        const result = await pool.query(sql);
        res.json({ message: `ลบข้อมูลของวันนี้สำเร็จ (${result.rowCount} รายการ)` });
    } catch (err) {
        console.error('Error on /admin/clear_today:', err);
        res.status(500).json({ message: err.message });
    }
});

// --- 6. เริ่มต้นเซิร์ฟเวอร์ ---
httpServer.listen(port, () => {
    console.log(`✅ เซิร์ฟเวอร์พร้อมทำงานแล้วที่ http://localhost:${port}`);
    initializeDatabase(); 
});