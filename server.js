const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./wazmoi.db');

// Création des tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    profile_link TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id INTEGER,
    receiver_link TEXT,
    content TEXT,
    is_anonymous BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sender_id) REFERENCES users(id)
  )`);
});

app.use(bodyParser.json());
app.use(express.static(__dirname));

// Routes API
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Username et password requis" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileLink = generateProfileLink(username);
    
    db.run(
      'INSERT INTO users (username, password, profile_link) VALUES (?, ?, ?)',
      [username, hashedPassword, profileLink],
      function(err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ profileLink });
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err || !user) return res.status(401).json({ error: "Identifiants incorrects" });
    
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Identifiants incorrects" });
    
    res.json({ 
      username: user.username,
      profileLink: user.profile_link
    });
  });
});

app.post('/api/messages', (req, res) => {
  const { receiverLink, content, isAnonymous, senderId } = req.body;
  db.run(
    'INSERT INTO messages (receiver_link, content, is_anonymous, sender_id) VALUES (?, ?, ?, ?)',
    [receiverLink, content, isAnonymous, senderId],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

app.get('/api/messages/:profileLink', (req, res) => {
  const { profileLink } = req.params;
  db.all(
    'SELECT content, is_anonymous FROM messages WHERE receiver_link = ? ORDER BY created_at DESC',
    [profileLink],
    (err, messages) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(messages);
    }
  );
});

app.get('/api/user/:username', (req, res) => {
  const { username } = req.params;
  db.get(
    'SELECT username, profile_link FROM users WHERE username = ?',
    [username],
    (err, user) => {
      if (err || !user) return res.status(404).json({ error: "Utilisateur non trouvé" });
      res.json(user);
    }
  );
});

// Servir index.html pour toutes les routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serveur Waz-Moi sur le port ${PORT}`));

function generateProfileLink(username) {
  return username.toLowerCase().replace(/\s+/g, '-') + '-' + Math.random().toString(36).substr(2, 5);
}