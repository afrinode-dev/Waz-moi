module.exports = (app, db) => {
    app.post('/api/messages', (req, res) => {
        const { receiverLink, content, isAnonymous = true } = req.body;
        
        db.get(
            `SELECT id FROM users WHERE profile_link = ?`,
            [receiverLink],
            (err, receiver) => {
                if (err || !receiver) {
                    return res.status(404).json({ error: "Destinataire non trouvé" });
                }
                
                const senderId = isAnonymous ? null : req.session.user?.id;
                
                db.run(
                    `INSERT INTO messages (receiver_id, content, is_anonymous, sender_id) 
                     VALUES (?, ?, ?, ?)`,
                    [receiver.id, content, isAnonymous, senderId],
                    function(err) {
                        if (err) return res.status(500).json({ error: err.message });
                        res.json({ success: true, messageId: this.lastID });
                    }
                );
            }
        );
    });

    app.get('/api/messages/:profileLink', (req, res) => {
        db.all(
            `SELECT m.*, u.username, u.avatar_color 
             FROM messages m
             LEFT JOIN users u ON m.sender_id = u.id
             WHERE m.receiver_id = (SELECT id FROM users WHERE profile_link = ?)
             ORDER BY m.created_at DESC`,
            [req.params.profileLink],
            (err, messages) => {
                if (err) return res.status(500).json({ error: err.message });
                
                res.json({
                    messages: messages.map(msg => ({
                        id: msg.id,
                        content: msg.content,
                        isAnonymous: msg.is_anonymous,
                        date: new Date(msg.created_at).toLocaleString(),
                        sender: msg.is_anonymous ? null : {
                            username: msg.username,
                            avatarColor: msg.avatar_color
                        }
                    }))
                });
            }
        );
    });
};