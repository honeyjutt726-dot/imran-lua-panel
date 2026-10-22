const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname)); 

const db = new sqlite3.Database('./panel.db');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        balance REAL DEFAULT 2147482178
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS licenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        game TEXT,
        license_key TEXT UNIQUE,
        max_devices INTEGER,
        duration TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // User ka naam Imran kar diya hai
    db.run(`INSERT OR IGNORE INTO users (id, username, balance) VALUES (1, 'Imran', 2147482178)`);
});

app.post('/api/generate', (req, res) => {
    const { game, max_devices, duration, price } = req.body;
    const userId = 1; 

    // Key format: IMRAN-XX-XX-XX
    const key = `IMRAN-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    db.get(`SELECT balance FROM users WHERE id = ?`, [userId], (err, user) => {
        if (user.balance < price) return res.status(400).json({ error: "Insufficient balance" });

        const newBalance = user.balance - price;
        db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newBalance, userId]);

        db.run(`INSERT INTO licenses (user_id, game, license_key, max_devices, duration) VALUES (?, ?, ?, ?, ?)`, 
        [userId, game, key, max_devices, duration], function(err) {
            if (err) return res.status(500).json({ error: "Key generation failed" });
            res.json({ success: true, key: key, new_balance: newBalance });
        });
    });
});

app.get('/api/user', (req, res) => {
    db.get(`SELECT username, balance FROM users WHERE id = 1`, [], (err, row) => {
        res.json(row);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});