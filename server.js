const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const DB_FILE = 'db.sqlite';

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
    }
});

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/:pseudo', (req, res) => {
    const { pseudo } = req.params;
    const isAdmin = req.query.admin === '1';
    
    if (isAdmin) {
        // Mode admin - afficher les messages reçus
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
                                font-family: Arial, sans-serif;
                                max-width: 600px;
                                margin: 0 auto;
                                padding: 20px;
                            }
                            .message {
                                background: #f5f5f5;
                                padding: 15px;
                                margin-bottom: 10px;
                                border-radius: 5px;
                                border-left: 4px solid #6c5ce7;
                            }
                            .timestamp {
                                font-size: 0.8em;
                                color: #666;
                                margin-top: 5px;
                            }
                            h1 {
                                color: #6c5ce7;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>Messages reçus pour @${pseudo}</h1>
                        ${messages.length > 0 
                            ? messages.map(msg => `
                                <div class="message">
                                    <p>${msg.content}</p>
                                    <div class="timestamp">${new Date(msg.created_at).toLocaleString()}</div>
                                </div>
                            `).join('')
                            : '<p>Aucun message reçu pour le moment.</p>'}
                    </body>
                    </html>
                `;
                
                res.send(html);
            }
        );
    } else {
        // Page publique pour envoyer des messages
        const html = `
            <!DOCTYPE html>
            <html lang="fr">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Envoyer un message à ${pseudo}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        max-width: 600px;
                        margin: 0 auto;
                        padding: 20px;
                    }
                    form {
                        margin-top: 20px;
                    }
                    textarea {
                        width: 100%;
                        padding: 10px;
                        margin-bottom: 10px;
                        border: 1px solid #ddd;
                        border-radius: 5px;
                        min-height: 100px;
                    }
                    button {
                        background: #6c5ce7;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                    }
                    h1 {
                        color: #6c5ce7;
                    }
                </style>
            </head>
            <body>
                <h1>Envoyer un message à @${pseudo}</h1>
                <p>Ton message sera envoyé de manière anonyme</p>
                <form id="message-form">
                    <textarea name="content" placeholder="Écris ton message ici..." required></textarea>
                    <button type="submit">Envoyer</button>
                </form>
                <p id="response-message"></p>
                
                <script>
                    document.getElementById('message-form').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const content = e.target.content.value.trim();
                        
                        if (!content) {
                            alert('Veuillez écrire un message');
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
                                document.getElementById('response-message').textContent = 'Message envoyé avec succès !';
                                document.getElementById('response-message').style.color = 'green';
                                e.target.reset();
                            } else {
                                document.getElementById('response-message').textContent = 'Erreur: ' + data.message;
                                document.getElementById('response-message').style.color = 'red';
                            }
                        } catch (error) {
                            document.getElementById('response-message').textContent = 'Erreur lors de l\'envoi du message';
                            document.getElementById('response-message').style.color = 'red';
                        }
                    });
                </script>
            </body>
            </html>
        `;
        
        res.send(html);
    }
});

app.post('/send', (req, res) => {
    const { pseudo, content } = req.body;
    
    if (!pseudo || !content) {
        return res.status(400).json({ success: false, message: 'Pseudo et contenu requis' });
    }
    
    db.run(
        'INSERT INTO messages (pseudo, content) VALUES (?, ?)',
        [pseudo, content],
        function(err) {
            if (err) {
                return res.status(500).json({ success: false, message: err.message });
            }
            
            res.json({ success: true, message: 'Message envoyé avec succès' });
        }
    );
});

// Démarrer le serveur
app.listen(PORT, () => {
    console.log(`Serveur démarré sur le port ${PORT}`);
});

module.exports = app;