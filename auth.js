module.exports = (app, db, bcrypt, generateProfileLink, colors) => {
    app.post('/api/register', async (req, res) => {
        try {
            const { username, email, password } = req.body;
            const hashedPass = await bcrypt.hash(password, 10);
            const profileLink = generateProfileLink(username);
            const avatarColor = colors[Math.floor(Math.random() * colors.length)];

            db.run(
                `INSERT INTO users (username, email, password, profile_link, avatar_color) 
                 VALUES (?, ?, ?, ?, ?)`,
                [username, email, hashedPass, profileLink, avatarColor],
                function(err) {
                    if (err) return res.status(400).json({ error: err.message });
                    
                    db.run(`INSERT INTO profiles (user_id) VALUES (?)`, [this.lastID]);
                    res.json({ success: true, profileLink });
                }
            );
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.post('/api/login', (req, res) => {
        const { email, password } = req.body;
        
        db.get(
            `SELECT * FROM users WHERE email = ?`,
            [email],
            async (err, user) => {
                if (!user || !(await bcrypt.compare(password, user.password))) {
                    return res.status(401).json({ error: "Identifiants incorrects" });
                }
                
                req.session.user = user;
                res.json({ 
                    success: true, 
                    isAdmin: user.is_admin,
                    profileLink: user.profile_link
                });
            }
        );
    });

    app.get('/api/logout', (req, res) => {
        req.session.destroy();
        res.json({ success: true });
    });
};