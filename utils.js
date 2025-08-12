
function generateLink(username) {
  return username.toLowerCase().replace(/[^a-z0-9]/g, "") + Math.floor(Math.random() * 1000);
}

module.exports = { generateLink };
