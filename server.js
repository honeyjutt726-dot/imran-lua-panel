const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); 

const db = new sqlite3.Database('./panel.db');

// ==========================================
// SECURITY CONFIGURATION
// ==========================================
const JWT_SECRET = "imran_super_secret_key_2099"; 
const MASTER_ACCESS_KEY = "IMRAN-VIP"; // <--- YAHAN APNI LOGIN KEY SET KARO

// Login Route
app.post('/api/login', (req, res) => {
    const { key } = req.body;
    if (key === MASTER_ACCESS_KEY) {
        // Token banega jo 30 din tak valid rahega
        const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: "Invalid Access Key" });
    }
});

// Middleware: Har API request se pehle token check karega
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
    
    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(401);
        req.user = user;
        next();
    });
}

// ==========================================
// DATABASE SETUP
// ==========================================
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        balance REAL DEFAULT 2147483648,
        role TEXT DEFAULT 'RESELLER',
        status TEXT DEFAULT 'ACTIVE',
        account_expires_at DATETIME DEFAULT '2099-01-12 03:17:04'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        game TEXT,
        license_key TEXT UNIQUE,
        max_devices INTEGER,
        duration_hours INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME
    )`);

    db.run(`INSERT OR IGNORE INTO users (id, username, balance, role, status) VALUES (1, 'imranxjutt', 2147483648, 'RESELLER', 'ACTIVE')`);
});

// ==========================================
// PROTECTED API ROUTES (Sirf login hone par chalenge)
// ==========================================
app.post('/api/generate', authenticateToken, (req, res) => {
    const { game, max_devices, duration_hours, price } = req.body;
    const userId = 1; 

    const key = `IMRAN-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const now = new Date();
    const expiry = new Date(now.getTime() + (duration_hours * 60 * 60 * 1000));

    db.get(`SELECT balance FROM users WHERE id = ?`, [userId], (err, user) => {
        if (user.balance < price) return res.status(400).json({ error: "Insufficient balance" });

        const newBalance = user.balance - price;
        db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, userId]);

        db.run(`INSERT INTO licenses (user_id, game, license_key, max_devices, duration_hours, expires_at) VALUES (?, ?, ?, ?, ?, ?)`, 
        [userId, game, key, max_devices, duration_hours, expiry.toISOString()], function(err) {
            if (err) return res.status(500).json({ error: "Key generation failed" });
            res.json({ success: true, key: key, new_balance: newBalance });
        });
    });
});

app.get('/api/user', authenticateToken, (req, res) => {
    db.get(`SELECT username, balance, role, status, account_expires_at FROM users WHERE id = 1`, [], (err, row) => {
        res.json(row);
    });
});

app.get('/api/stats', authenticateToken, (req, res) => {
    const now = new Date().toISOString();
    db.get(`SELECT COUNT(*) as total FROM licenses WHERE user_id = 1`, [], (err, totalRow) => {
        db.get(`SELECT COUNT(*) as active FROM licenses WHERE user_id = 1 AND expires_at > ?`, [now], (err, activeRow) => {
            db.get(`SELECT COUNT(*) as users FROM users`, [], (err, usersRow) => {
                const total = totalRow ? totalRow.total : 0;
                const active = activeRow ? activeRow.active : 0;
                res.json({
                    total: total,
                    active: active,
                    inactive: total - active,
                    users: usersRow ? usersRow.users : 1
                });
            });
        });
    });
});

app.get('/api/keys', authenticateToken, (req, res) => {
    const now = new Date().toISOString();
    db.all(`SELECT *, CASE WHEN expires_at > ? THEN 'ACTIVE' ELSE 'INACTIVE' END as status FROM licenses WHERE user_id = 1 ORDER BY id DESC`, [now], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
