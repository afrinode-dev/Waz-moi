const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const DB_FILE = 'db.sqlite';
const SECRET_KEY = process.env.SECRET_KEY || 'defaultSecret123!';

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Initialisation de la base de données
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) {
        console.error('Erreur de connexion à la base de données:', err.message);
    } else {
        console.log('Connecté à la base de données SQLite');
        db.run(`
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pseudo TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
        db.run(`
            CREATE TABLE IF NOT EXISTS access_tokens (
                pseudo TEXT PRIMARY KEY,
                token TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
});

// Fonction pour générer et stocker un token sécurisé
async function generateAndStoreToken(pseudo) {
    const token = crypto.randomBytes(16).toString('hex');
    
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO access_tokens (pseudo, token) VALUES (?, ?)`,
            [pseudo, token],
            function(err) {
                if (err) return reject(err);
                resolve(token);
            }
        );
    });
}

// Fonction pour vérifier un token
async function verifyToken(pseudo, token) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT token FROM access_tokens WHERE pseudo = ?`,
            [pseudo],
            (err, row) => {
                if (err) return reject(err);
                resolve(row && row.token === token);
            }
        );
    });
}

// Route pour la page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Route pour créer un nouveau lien privé
app.get('/create-private-link/:pseudo', async (req, res) => {
    const { pseudo } = req.params;
    
    try {
        const token = await generateAndStoreToken(pseudo);
        res.json({
            success: true,
            privateLink: `${req.protocol}://${req.get('host')}/${pseudo}/private?token=${token}`
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Erreur lors de la création du lien' });
    }
});

// Route pour la page publique d'envoi de messages
app.get('/:pseudo', (req, res) => {
    const { pseudo } = req.params;
    
    const html = `
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Envoyer un message à ${pseudo}</title>
            <style>
                body {
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                    background-color: #f8f9fa;
                }
                h1 {
                    color: #6c5ce7;
                    text-align: center;
                }
                .container {
                    background: white;
                    padding: 2rem;
                    border-radius: 10px;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                form {
                    margin-top: 20px;
                }
                textarea {
                    width: 100%;
                    padding: 15px;
                    margin-bottom: 15px;
                    border: 2px solid #ddd;
                    border-radius: 8px;
                    min-height: 150px;
                    font-size: 16px;
                    transition: border 0.3s;
                }
                textarea:focus {
                    border-color: #6c5ce7;
                    outline: none;
                }
                button {
                    background: #6c5ce7;
                    color: white;
                    border: none;
                    padding: 12px 25px;
                    border-radius: 8px;
                    font-size: 16px;
                    cursor: pointer;
                    transition: background 0.3s;
                    width: 100%;
                }
                button:hover {
                    background: #5649c0;
                }
                #response-message {
                    margin-top: 15px;
                    padding: 10px;
                    border-radius: 5px;
                    text-align: center;
                }
                .success {
                    background: #d4edda;
                    color: #155724;
                }
                .error {
                    background: #f8d7da;
                    color: #721c24;
                }
                .private-section {
                    margin-top: 30px;
                    padding: 20px;
                    background: #f1f1f1;
                    border-radius: 8px;
                }
                .private-link {
                    word-break: break-all;
                    color: #6c5ce7;
                    font-weight: bold;
                    margin: 10px 0;
                    display: inline-block;
                }
                .copy-btn {
                    background: #00b894;
                    color: white;
                    border: none;
                    padding: 8px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    margin-top: 10px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Envoyer un message à @${pseudo}</h1>
                <p style="text-align: center; color: #666;">Ton message sera envoyé de manière anonyme</p>
                
                <form id="message-form">
                    <textarea name="content" placeholder="Écris ton message ici..." required></textarea>
                    <button type="submit">Envoyer</button>
                </form>
                <div id="response-message"></div>
                
                <div class="private-section">
                    <h3>Accès à tes messages</h3>
                    <p>Pour voir les messages que tu as reçus, utilise ce lien privé :</p>
                    <a id="private-link" class="private-link" href="#"></a>
                    <button id="copy-btn" class="copy-btn">Copier le lien</button>
                    <p><small>Conserve ce lien précieusement, c'est le seul moyen d'accéder à tes messages.</small></p>
                </div>
            </div>

            <script>
                // Générer le lien privé
                async function generatePrivateLink() {
                    try {
                        const response = await fetch('/create-private-link/${pseudo}');
                        const data = await response.json();
                        
                        if (data.success) {
                            const linkElement = document.getElementById('private-link');
                            linkElement.textContent = data.privateLink;
                            linkElement.href = data.privateLink;
                        }
                    } catch (error) {
                        console.error('Erreur:', error);
                    }
                }
                
                // Copier le lien
                document.getElementById('copy-btn').addEventListener('click', () => {
                    const link = document.getElementById('private-link').textContent;
                    navigator.clipboard.writeText(link).then(() => {
                        const btn = document.getElementById('copy-btn');
                        btn.textContent = 'Copié !';
                        setTimeout(() => {
                            btn.textContent = 'Copier le lien';
                        }, 2000);
                    });
                });
                
                // Envoyer un message
                document.getElementById('message-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const content = e.target.content.value.trim();
                    const responseElement = document.getElementById('response-message');
                    
                    if (!content) {
                        responseElement.textContent = 'Veuillez écrire un message';
                        responseElement.className = 'error';
                        return;
                    }
                    
                    try {
                        const response = await fetch('/send', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                pseudo: '${pseudo}',
                                content
                            })
                        });
                        
                        const data = await response.json();
                        
                        if (data.success) {
                            responseElement.textContent = 'Message envoyé avec succès !';
                            responseElement.className = 'success';
                            e.target.reset();
                        } else {
                            responseElement.textContent = 'Erreur: ' + data.message;
                            responseElement.className = 'error';
                        }
                    } catch (error) {
                        responseElement.textContent = 'Erreur lors de l\\'envoi du message';
                        responseElement.className = 'error';
                    }
                });
                
                // Générer le lien au chargement
                generatePrivateLink();
            </script>
        </body>
        </html>
    `;
    
    res.send(html);
});

// Route pour l'espace privé
app.get('/:pseudo/private', async (req, res) => {
    const { pseudo } = req.params;
    const { token } = req.query;
    
    // Vérification du token
    const isValid = await verifyToken(pseudo, token);
    if (!isValid) {
        return res.status(403).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Accès refusé</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    h1 { color: #d63031; }
                </style>
            </head>
            <body>
                <h1>Accès non autorisé</h1>
                <p>Le token fourni est invalide ou a expiré.</p>
                <p>Retourne à la page de <a href="/${pseudo}">@${pseudo}</a> pour générer un nouveau lien.</p>
            </body>
            </html>
        `);
    }
    
    // Afficher les messages
    db.all(
        'SELECT * FROM messages WHERE pseudo = ? ORDER BY created_at DESC',
        [pseudo],
        (err, messages) => {
            if (err) {
                return res.status(500).send('Erreur de base de données');
            }
            
            const html = `
                <!DOCTYPE html>
                <html lang="fr">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Messages reçus - ${pseudo}</title>
                    <style>
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            max-width: 800px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: #f8f9fa;
                        }
                        .header {
                            text-align: center;
                            margin-bottom: 30px;
                        }
                        h1 {
                            color: #6c5ce7;
                        }
                        .message-count {
                            color: #666;
                            margin-bottom: 20px;
                        }
                        .messages {
                            margin-top: 20px;
                        }
                        .message {
                            background: white;
                            padding: 20px;
                            margin-bottom: 15px;
                            border-radius: 8px;
                            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
                            position: relative;
                            border-left: 4px solid #6c5ce7;
                        }
                        .message-content {
                            font-size: 16px;
                            line-height: 1.6;
                        }
                        .timestamp {
                            font-size: 14px;
                            color: #666;
                            margin-top: 10px;
                            text-align: right;
                        }
                        .empty-state {
                            text-align: center;
                            padding: 40px;
                            color: #666;
                        }
                        .back-link {
                            display: inline-block;
                            margin-top: 20px;
                            color: #6c5ce7;
                            text-decoration: none;
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1>Messages reçus pour @${pseudo}</h1>
                        <div class="message-count">${messages.length} message${messages.length !== 1 ? 's' : ''}</div>
                    </div>
                    
                    <div class="messages">
                        ${messages.length > 0 
                            ? messages.map(msg => `
                                <div class="message">
                                    <div class="message-content">${msg.content}</div>
                                    <div class="timestamp">${new Date(msg.created_at).toLocaleString('fr-FR')}</div>
                                </div>
                            `).join('')
                            : `<div class="empty-state">
                                <p>Aucun message reçu pour le moment.</p>
                                <p>Partage ton lien public pour recevoir des messages !</p>
                               </div>`}
                    </div>
                    
                    <a href="/${pseudo}" class="back-link">← Retour à la page publique</a>
                </body>
                </html>
            `;
            
            res.send(html);
        }
    );
});

// Route pour envoyer un message
app.post('/send', (req, res) => {
    const { pseudo, content } = req.body;
    
    if (!pseudo || !content) {
        return res.status(400).json({ success: false, message: 'Pseudo et contenu requis' });
    }
    
    if (content.length > 500) {
        return res.status(400).json({ success: false, message: 'Le message ne doit pas dépasser 500 caractères' });
    }
    
    db.run(
        'INSERT INTO messages (pseudo, content) VALUES (?, ?)',
        [pseudo, content],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
            
            res.json({ 
                success: true, 
                message: 'Message envoyé avec succès',
                messageId: this.lastID
            });
        }
    );
});

// Démarrer le serveur
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Serveur démarré sur le port ${PORT}`);
    });
}

module.exports = app;