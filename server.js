const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new sqlite3.Database('./wazmoi.db');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'gabon-vert-jaune-bleu',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

// Initialisation DB
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        email TEXT UNIQUE,
        password TEXT,
        profile_link TEXT UNIQUE,
        full_name TEXT,
        avatar_color TEXT DEFAULT '#009B3A',
        is_admin BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER,
        receiver_id INTEGER,
        content TEXT,
        is_anonymous BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(sender_id) REFERENCES users(id),
        FOREIGN KEY(receiver_id) REFERENCES users(id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS profiles (
        user_id INTEGER PRIMARY KEY,
        bio TEXT,
        location TEXT,
        website TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Créer un admin par défaut si inexistant
    db.get("SELECT * FROM users WHERE is_admin = 1", (err, row) => {
        if (!row) {
            const adminPass = bcrypt.hashSync('admin123', 10);
            db.run(`INSERT INTO users (username, email, password, is_admin, full_name) 
                   VALUES (?, ?, ?, 1, 'Admin Waz-Moi')`, 
                   ['admin', 'admin@wazmoi.com', adminPass]);
        }
    });
});

// Fonctions utilitaires
const generateProfileLink = (username) => 
    `${username.toLowerCase().replace(/\s+/g, '-')}-${Math.random().toString(36).substr(2, 5)}`;

const gabonColors = ['#009B3A', '#FCD116', '#6C5CE7', '#00B894', '#CE1126'];

// Middleware d'authentification admin
const isAdmin = (req, res, next) => {
    if (req.session.user?.is_admin) return next();
    res.status(403).json({ error: "Accès refusé" });
};

// Routes API
require('./auth')(app, db, bcrypt, generateProfileLink, gabonColors);
require('./messages')(app, db);
require('./profiles')(app, db);

// Interface Admin
app.get('/admin', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/admin/data', isAdmin, (req, res) => {
    db.serialize(() => {
        db.all("SELECT * FROM users", (err, users) => {
            db.all("SELECT * FROM messages", (err, messages) => {
                db.all("SELECT * FROM profiles", (err, profiles) => {
                    res.json({ users, messages, profiles });
                });
            });
        });
    });
});

// Routes publiques
app.get('/@:profileLink', (req, res) => {
    db.get("SELECT id FROM users WHERE profile_link = ?", [req.params.profileLink], (err, user) => {
        if (user) res.sendFile(path.join(__dirname, 'profile.html'));
        else res.status(404).sendFile(path.join(__dirname, '404.html'));
    });
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur Waz-Moi en écoute sur le port ${PORT}`);
    console.log(`Mode: ${process.env.NODE_ENV || 'développement'}`);
});