const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const cors = require('cors');

const app = express();
const db = new sqlite3.Database('./wazmoi.db');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

// Création des tables
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    profile_link TEXT UNIQUE,
    full_name TEXT,
    avatar_color TEXT DEFAULT '#009B3A',
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

  db.run(`CREATE TABLE IF NOT EXISTS profiles (
    user_id INTEGER PRIMARY KEY,
    bio TEXT,
    location TEXT,
    website TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  )`);
});

// Fonction pour générer un lien de profil
function generateProfileLink(username) {
  const cleaned = username.toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  return `${cleaned}-${Math.random().toString(36).substr(2, 5)}`;
}

// Fonction pour générer une couleur aléatoire
function generateRandomColor() {
  const colors = ['#009B3A', '#FCD116', '#CE1126', '#6C5CE7', '#00B894'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Middleware pour logger les requêtes
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Routes API

// Inscription
app.post('/api/register', async (req, res) => {
  const { username, password, fullName } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const profileLink = generateProfileLink(username);
    const avatarColor = generateRandomColor();

    db.run(
      `INSERT INTO users (username, password, profile_link, full_name, avatar_color) 
       VALUES (?, ?, ?, ?, ?)`,
      [username, hashedPassword, profileLink, fullName || username, avatarColor],
      function(err) {
        if (err) {
          if (err.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: "Ce nom d'utilisateur est déjà pris" });
          }
          return res.status(500).json({ error: err.message });
        }
        
        // Créer un profil vide pour l'utilisateur
        db.run(
          `INSERT INTO profiles (user_id) VALUES (?)`,
          [this.lastID],
          (err) => {
            if (err) {
              console.error("Erreur création profil:", err);
            }
            res.json({ 
              success: true,
              profileLink,
              username,
              avatarColor
            });
          }
        );
      }
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Connexion
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: "Nom d'utilisateur et mot de passe requis" });
  }

  db.get(
    `SELECT users.*, profiles.bio 
     FROM users 
     LEFT JOIN profiles ON users.id = profiles.user_id 
     WHERE username = ?`,
    [username],
    async (err, user) => {
      if (err || !user) {
        return res.status(401).json({ error: "Identifiants incorrects" });
      }
      
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ error: "Identifiants incorrects" });
      }
      
      res.json({
        success: true,
        username: user.username,
        profileLink: user.profile_link,
        fullName: user.full_name,
        avatarColor: user.avatar_color,
        bio: user.bio
      });
    }
  );
});

// Envoyer un message
app.post('/api/messages', (req, res) => {
  const { receiverLink, content, isAnonymous = true, senderUsername } = req.body;
  
  if (!receiverLink || !content) {
    return res.status(400).json({ error: "Lien du destinataire et contenu requis" });
  }

  // Vérifier si le destinataire existe
  db.get(
    `SELECT id FROM users WHERE profile_link = ?`,
    [receiverLink],
    (err, receiver) => {
      if (err || !receiver) {
        return res.status(404).json({ error: "Destinataire non trouvé" });
      }

      // Trouver l'expéditeur si non anonyme
      let senderId = null;
      if (!isAnonymous && senderUsername) {
        db.get(
          `SELECT id FROM users WHERE username = ?`,
          [senderUsername],
          (err, sender) => {
            if (err) {
              console.error("Erreur recherche expéditeur:", err);
            }
            senderId = sender ? sender.id : null;
            createMessage();
          }
        );
      } else {
        createMessage();
      }

      function createMessage() {
        db.run(
          `INSERT INTO messages (receiver_link, content, is_anonymous, sender_id) 
           VALUES (?, ?, ?, ?)`,
          [receiverLink, content, isAnonymous, senderId],
          function(err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            res.json({ 
              success: true,
              message: "Message envoyé avec succès",
              messageId: this.lastID
            });
          }
        );
      }
    }
  );
});

// Récupérer les messages d'un profil
app.get('/api/messages/:profileLink', (req, res) => {
  const { profileLink } = req.params;
  
  db.all(
    `SELECT m.content, m.is_anonymous, m.created_at, 
            u.username as sender_name, u.avatar_color as sender_color
     FROM messages m
     LEFT JOIN users u ON m.sender_id = u.id
     WHERE m.receiver_link = ?
     ORDER BY m.created_at DESC`,
    [profileLink],
    (err, messages) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Formater les dates et anonymiser si nécessaire
      const formattedMessages = messages.map(msg => ({
        content: msg.content,
        isAnonymous: msg.is_anonymous,
        date: new Date(msg.created_at).toLocaleString(),
        sender: msg.is_anonymous ? null : {
          username: msg.sender_name,
          avatarColor: msg.sender_color
        }
      }));
      
      res.json({ messages: formattedMessages });
    }
  );
});

// Récupérer les infos d'un profil
app.get('/api/profile/:profileLink', (req, res) => {
  const { profileLink } = req.params;
  
  db.get(
    `SELECT u.username, u.full_name, u.profile_link, u.avatar_color, 
            p.bio, p.location, p.website
     FROM users u
     LEFT JOIN profiles p ON u.id = p.user_id
     WHERE u.profile_link = ?`,
    [profileLink],
    (err, profile) => {
      if (err || !profile) {
        return res.status(404).json({ error: "Profil non trouvé" });
      }
      
      res.json({
        success: true,
        profile: {
          username: profile.username,
          fullName: profile.full_name,
          profileLink: profile.profile_link,
          avatarColor: profile.avatar_color,
          bio: profile.bio,
          location: profile.location,
          website: profile.website
        }
      });
    }
  );
});

// Mettre à jour le profil
app.put('/api/profile/:username', (req, res) => {
  const { username } = req.params;
  const { fullName, bio, location, website } = req.body;
  
  db.serialize(() => {
    // Mettre à jour les infos de base
    db.run(
      `UPDATE users SET full_name = ? WHERE username = ?`,
      [fullName, username],
      function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        // Mettre à jour le profil
        db.run(
          `INSERT OR REPLACE INTO profiles (user_id, bio, location, website)
           VALUES (
             (SELECT id FROM users WHERE username = ?),
             ?, ?, ?
           )`,
          [username, bio, location, website],
          function(err) {
            if (err) {
              return res.status(500).json({ error: err.message });
            }
            
            res.json({ 
              success: true,
              message: "Profil mis à jour avec succès"
            });
          }
        );
      }
    );
  });
});

// Route pour la page de profil publique
app.get('/@:profileLink', (req, res) => {
  const { profileLink } = req.params;
  
  // Vérifier si le profil existe
  db.get(
    `SELECT username FROM users WHERE profile_link = ?`,
    [`${profileLink}`],
    (err, user) => {
      if (err || !user) {
        return res.status(404).sendFile(path.join(__dirname, '404.html'));
      }
      
      // Servir la page de profil
      res.sendFile(path.join(__dirname, 'profile.html'));
    }
  );
});

// Servir index.html pour toutes les autres routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Gestion des erreurs
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Une erreur est survenue' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Serveur Waz-Moi en écoute sur le port ${PORT}`);
  console.log(`Mode: ${process.env.NODE_ENV || 'développement'}`);
});