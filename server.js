require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('✗ JWT_SECRET manquant dans .env');
  process.exit(1);
}
const JWT_EXPIRES = '7d';

// ── Pages ───────────────────────────────────────────────
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'AvocAI.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/success',  (req, res) => res.sendFile(path.join(__dirname, 'success.html')));
app.get('/cancel',   (req, res) => res.sendFile(path.join(__dirname, 'cancel.html')));

// ── Middleware JWT ──────────────────────────────────────
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token manquant.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

// ── Auth: Register ──────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
  if (password.length < 6)   return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide.' });

  const lower = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(lower);
  if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(lower, hash);
    const token = jwt.sign({ id: r.lastInsertRowid, email: lower }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: r.lastInsertRowid, email: lower, plan: 'free' } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
});

// ── Auth: Login ─────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });

  const lower = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(lower);
  if (!user) return res.status(401).json({ error: 'Identifiants invalides.' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Identifiants invalides.' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
});

// ── Auth: Me ────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, plan FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user });
});

// ── Conversations ───────────────────────────────────────
app.get('/api/conversations', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, created_at FROM conversations WHERE user_id = ? ORDER BY id DESC'
  ).all(req.user.id);
  res.json({ conversations: rows });
});

app.get('/api/conversations/:id', requireAuth, (req, res) => {
  const conv = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: 'Conversation introuvable.' });
  const rows = db.prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC').all(req.params.id);
  const messages = rows.map(r => {
    try { return { role: r.role, ...JSON.parse(r.content) }; }
    catch { return { role: r.role, text: r.content }; }
  });
  res.json({ conversation: conv, messages });
});

app.delete('/api/conversations/:id', requireAuth, (req, res) => {
  const r = db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Conversation introuvable.' });
  res.json({ ok: true });
});

// ── OpenAI ──────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Tu es AvocAI, un assistant juridique intelligent spécialisé dans le droit français et européen.
Quand un utilisateur décrit une situation, tu dois TOUJOURS répondre avec cette structure JSON exacte :

{
  "resume": "Résumé de la situation en 1-2 phrases",
  "risque_niveau": 3,
  "risque_label": "Modéré",
  "probabilite": "12%",
  "delai_legal": "45 jours pour contester",
  "articles": [
    {
      "code": "Art. L121-3 — Code de la Route",
      "texte": "Extrait pertinent de l'article...",
      "lien": "https://www.legifrance.gouv.fr/..."
    }
  ],
  "sanctions": {
    "amende_max": "3 750 €",
    "prison_max": "3 mois"
  },
  "actions_gratuites": [
    "Action possible 1",
    "Action possible 2"
  ],
  "demarche_disponible": true,
  "demarche_titre": "Contestez cette amende officiellement",
  "demarche_description": "Nous vous guidons pas à pas..."
}

risque_niveau va de 1 (très faible) à 5 (critique).
probabilite : exprime la probabilité d'être effectivement poursuivi en justice sous forme de pourcentage (ex: "8%", "23%"). Reste réaliste et plutôt bas (la plupart des infractions mineures ont moins de 20% de chance de poursuite).
sanctions.amende_max : montant maximum de l'amende encourue (ex: "3 750 €"), ou null si aucune amende.
sanctions.prison_max : peine maximale de prison encourue (ex: "6 mois"), ou null si aucune peine d'emprisonnement.
demarche_disponible est true seulement si une démarche officielle concrète est possible (contester une amende, rédiger un courrier officiel, remplir un formulaire, etc.).
Réponds UNIQUEMENT en JSON valide, sans markdown, sans balises \`\`\`.`;

// ── POST /api/chat (auth requise + persistance) ─────────
app.post('/api/chat', requireAuth, async (req, res) => {
  const { message, conversation_id } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Le champ "message" est requis.' });
  }

  // Résolution / création de la conversation
  let convId = conversation_id;
  if (convId) {
    const c = db.prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?').get(convId, req.user.id);
    if (!c) return res.status(404).json({ error: 'Conversation introuvable.' });
  } else {
    const title = message.trim().slice(0, 60);
    const r = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title);
    convId = r.lastInsertRowid;
  }

  // Sauvegarde du message utilisateur
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(convId, 'user', JSON.stringify({ text: message.trim() }));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: message.trim() },
      ],
    });

    const raw = response.choices[0]?.message?.content || '';
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse error. Raw response:', raw);
      return res.status(500).json({ error: 'Réponse IA invalide. Veuillez réessayer.' });
    }

    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
      .run(convId, 'ai', JSON.stringify(data));

    res.json({ ...data, conversation_id: convId });
  } catch (err) {
    console.error('OpenAI API error:', err.status, err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: status === 401
        ? 'Clé API OpenAI invalide ou manquante.'
        : `Erreur OpenAI (${status}): ${err.message || 'Veuillez réessayer.'}`,
    });
  }
});

// ── POST /api/create-checkout ───────────────────────────
app.post('/api/create-checkout', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Paiement non configuré (clés Stripe manquantes).' });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: process.env.SUCCESS_URL || 'http://localhost:3000/success',
      cancel_url: process.env.CANCEL_URL || 'http://localhost:3000/cancel',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    const msg = err.message?.includes('No such price')
      ? 'STRIPE_PRICE_ID invalide — utilise un ID commençant par price_ (pas prod_).'
      : `Impossible de créer la session de paiement: ${err.message}`;
    res.status(500).json({ error: msg });
  }
});

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ AvocAI server running at http://localhost:${PORT}\n`);
});
