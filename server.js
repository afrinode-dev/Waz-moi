
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const db = require("./db");
const { generateLink } = require("./utils");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "../public")));

app.post("/api/send", (req, res) => {
  const { receiver_link, content } = req.body;
  if (!receiver_link || !content) return res.status(400).send("Données manquantes.");
  db.run("INSERT INTO messages (receiver_link, content) VALUES (?, ?)", [receiver_link, content], err => {
    if (err) return res.status(500).send("Erreur serveur.");
    res.sendStatus(200);
  });
});

app.get("/api/messages", (req, res) => {
  const user = req.query.user;
  db.all("SELECT * FROM messages WHERE receiver_link = ? ORDER BY created_at DESC", [user], (err, rows) => {
    if (err) return res.status(500).send("Erreur serveur.");
    res.json(rows);
  });
});

const PORT = 3000;
app.listen(PORT, () => console.log("Serveur lancé sur http://localhost:" + PORT));
