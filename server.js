require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
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

// Google OAuth client
const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID     || null;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || null;
const APP_URL              = process.env.APP_URL || 'http://localhost:3000';
const GOOGLE_REDIRECT_URI  = `${APP_URL}/api/auth/google/callback`;

const googleClient = (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
  ? new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI)
  : null;

// ── Quota config ────────────────────────────────────────
const QUOTA_LIMITS = { free: 5, pro: 50, pro_plus: 50, admin: Infinity };
const IP_DAILY_LIMIT_FREE = 5; // max requêtes/jour/IP tous comptes free confondus

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function getClientIP(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}

// ── Pages ───────────────────────────────────────────────
app.get('/',         (req, res) => res.sendFile(path.join(__dirname, 'AvocAI.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/success',  (req, res) => res.sendFile(path.join(__dirname, 'success.html')));
app.get('/cancel',   (req, res) => res.sendFile(path.join(__dirname, 'cancel.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'checkout.html')));

// ── Config publique (Google Client ID) ─────────────────
app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID || null });
});

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

// ── Middleware Quota ────────────────────────────────────
function checkQuota(req, res, next) {
  const userId = req.user.id;
  const userRecord = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  const plan = userRecord?.plan || 'free';

  // Admin = illimité, bypass total du quota
  if (plan === 'admin') return next();

  const limit = QUOTA_LIMITS[plan] ?? QUOTA_LIMITS.free;
  const today = todayUTC();

  // Upsert : crée la ligne si elle n'existe pas
  db.prepare(
    'INSERT OR IGNORE INTO daily_requests (user_id, date, count) VALUES (?, ?, 0)'
  ).run(userId, today);

  const record = db.prepare(
    'SELECT count FROM daily_requests WHERE user_id = ? AND date = ?'
  ).get(userId, today);

  if (record.count >= limit) {
    return res.status(429).json({
      error: `Quota journalier atteint. Passez à Premium pour continuer.`,
      quota: { used: record.count, limit, plan, reset: 'minuit UTC' },
    });
  }

  // Limite IP par jour pour les comptes gratuits (bloque les multi-comptes)
  if (plan === 'free') {
    const ip = getClientIP(req);
    db.prepare('INSERT OR IGNORE INTO ip_daily_requests (ip, date, count) VALUES (?, ?, 0)').run(ip, today);
    const ipRecord = db.prepare('SELECT count FROM ip_daily_requests WHERE ip = ? AND date = ?').get(ip, today);
    if (ipRecord && ipRecord.count >= IP_DAILY_LIMIT_FREE) {
      return res.status(429).json({
        error: `Limite journalière atteinte pour votre connexion. Réessayez demain ou passez à Premium.`,
        quota: { used: record.count, limit, plan, reset: 'minuit UTC' },
        ip_exhausted: true,
      });
    }
    db.prepare('UPDATE ip_daily_requests SET count = count + 1 WHERE ip = ? AND date = ?').run(ip, today);
  }

  // Incrémenter le compteur utilisateur
  db.prepare(
    'UPDATE daily_requests SET count = count + 1 WHERE user_id = ? AND date = ?'
  ).run(userId, today);

  req.quotaInfo = { used: record.count + 1, limit, plan };
  next();
}

// ── Auth: Register ──────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, firstName, lastName, birthDate } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis.' });
  if (!birthDate) return res.status(400).json({ error: 'Date de naissance requise.' });
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) return res.status(400).json({ error: 'Date de naissance invalide (format JJ/MM/AAAA).' });
  if (password.length < 6)   return res.status(400).json({ error: 'Mot de passe trop court (6 caractères minimum).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide.' });

  const lower = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(lower);
  if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const r = db.prepare('INSERT INTO users (email, password_hash, first_name, last_name, birth_date) VALUES (?, ?, ?, ?, ?)').run(lower, hash, firstName.trim(), lastName.trim(), birthDate);
    const userId = Number(r.lastInsertRowid);
    const token = jwt.sign({ id: userId, email: lower }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: userId, email: lower, plan: 'free', firstName: firstName.trim(), lastName: lastName.trim() } });
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

  // Compte Google sans mot de passe
  if (!user.password_hash) {
    return res.status(401).json({ error: 'Ce compte utilise la connexion Google.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Identifiants invalides.' });

  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.json({ token, user: { id: user.id, email: user.email, plan: user.plan } });
});

// ── Auth: Google — démarrage du flow OAuth ─────────────
app.get('/api/auth/google/start', (req, res) => {
  if (!googleClient) {
    return res.redirect('/login?error=google_not_configured');
  }
  const url = googleClient.generateAuthUrl({
    access_type: 'online',
    scope: ['email', 'profile'],
    prompt: 'select_account',
  });
  res.redirect(url);
});

// ── Auth: Google — callback après validation ────────────
app.get('/api/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect('/login?error=google_cancelled');
  }

  try {
    // Échange le code contre des tokens
    const { tokens } = await googleClient.getToken(code);
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, given_name, family_name } = payload;
    const lower = email.toLowerCase().trim();

    // Récupère la date de naissance via l'API People
    let birthDate = null;
    try {
      const peopleRes = await fetch(
        `https://people.googleapis.com/v1/people/me?personFields=birthdays`,
        { headers: { Authorization: `Bearer ${tokens.access_token}` } }
      );
      const peopleData = await peopleRes.json();
      const bday = peopleData.birthdays?.[0]?.date;
      if (bday?.day && bday?.month && bday?.year) {
        birthDate = `${String(bday.day).padStart(2,'0')}/${String(bday.month).padStart(2,'0')}/${bday.year}`;
      }
    } catch {}

    // 1. Cherche par google_id
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);

    // 2. Cherche par email (liaison de compte)
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(lower);
      if (user) {
        db.prepare('UPDATE users SET google_id = ?, first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?), birth_date = COALESCE(birth_date, ?) WHERE id = ?')
          .run(googleId, given_name || null, family_name || null, birthDate, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }

    // 3. Création d'un nouveau compte
    if (!user) {
      const r = db.prepare(
        "INSERT INTO users (email, password_hash, google_id, first_name, last_name, birth_date) VALUES (?, '', ?, ?, ?, ?)"
      ).run(lower, googleId, given_name || null, family_name || null, birthDate);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const userData = encodeURIComponent(JSON.stringify({
      id: user.id, email: user.email, plan: user.plan,
      firstName: user.first_name, lastName: user.last_name,
    }));

    // Redirige vers l'app avec le token en query param (récupéré côté frontend)
    res.redirect(`/?auth_token=${token}&auth_user=${userData}`);
  } catch (err) {
    console.error('Google callback error:', err.message);
    res.redirect('/login?error=google_failed');
  }
});

// ── Auth: Google (legacy — token GIS direct) ───────────
app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) {
    return res.status(503).json({ error: 'Authentification Google non configurée.' });
  }
  const { credential } = req.body || {};
  if (!credential) return res.status(400).json({ error: 'Token Google manquant.' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const { sub: googleId, email, given_name, family_name } = ticket.getPayload();
    const lower = email.toLowerCase().trim();
    let user = db.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
    if (!user) {
      user = db.prepare('SELECT * FROM users WHERE email = ?').get(lower);
      if (user) {
        db.prepare('UPDATE users SET google_id = ?, first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?) WHERE id = ?')
          .run(googleId, given_name || null, family_name || null, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }
    if (!user) {
      const r = db.prepare("INSERT INTO users (email, password_hash, google_id, first_name, last_name) VALUES (?, '', ?, ?, ?)").run(lower, googleId, given_name || null, family_name || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    }
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    res.json({ token, user: { id: user.id, email: user.email, plan: user.plan, firstName: user.first_name, lastName: user.last_name } });
  } catch (err) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Token Google invalide ou expiré.' });
  }
});

// ── Auth: Me ────────────────────────────────────────────
app.get('/api/auth/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, plan, first_name, last_name FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: { ...user, firstName: user.first_name, lastName: user.last_name } });
});

// ── Quota: Status ───────────────────────────────────────
app.get('/api/quota/status', requireAuth, (req, res) => {
  const userId = req.user.id;
  const userRecord = db.prepare('SELECT plan FROM users WHERE id = ?').get(userId);
  const plan = userRecord?.plan || 'free';
  const limit = QUOTA_LIMITS[plan] ?? QUOTA_LIMITS.free;
  const today = todayUTC();

  const record = db.prepare(
    'SELECT count FROM daily_requests WHERE user_id = ? AND date = ?'
  ).get(userId, today);

  const used = record?.count ?? 0;
  res.json({ used, limit, plan, remaining: Math.max(0, limit - used) });
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

app.post('/api/conversations/import-guest', requireAuth, (req, res) => {
  const { userMessage, aiResponse } = req.body || {};
  if (!userMessage || !aiResponse) return res.status(400).json({ error: 'Données manquantes.' });

  const title = userMessage.length > 50 ? userMessage.slice(0, 50) + '…' : userMessage;
  try {
    const convResult = db.prepare('INSERT INTO conversations (user_id, title) VALUES (?, ?)').run(req.user.id, title);
    const convId = convResult.lastInsertRowid;
    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(convId, 'user', JSON.stringify({ text: userMessage }));
    db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)').run(convId, 'ai', JSON.stringify(aiResponse));
    res.json({ conversation_id: convId, title });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la sauvegarde.' });
  }
});

// ── OpenAI ──────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `Tu es AvocAI, un assistant juridique intelligent et pragmatique, spécialisé dans le droit français et européen.

PRINCIPE FONDAMENTAL : Tu donnes des analyses RÉALISTES, pas théoriques. Les sanctions encourues maximales sont rarement appliquées en pratique. Tu dois aider l'utilisateur à comprendre sa situation réelle, pas l'effrayer avec des peines maximales improbables.

════════════════════════════════════════
RÈGLE 1 — Message vague ou hors-sujet
════════════════════════════════════════
Si le message est vague ("bonjour", "j'ai un problème", "je veux contacter un avocat" sans contexte, "aide-moi") :
- resume : pose UNE question concrète et orientée pour faire avancer l'utilisateur. Évite les phrases creuses comme "Décrivez votre situation en détail". Donne plutôt des exemples concrets de domaines (ex : "Pour vous aider, dites-moi : s'agit-il d'un litige avec un commerçant, votre employeur, votre propriétaire, une amende, ou autre chose ?").
- risque_niveau : 1 | probabilite : "0%" | delai_legal : null
- articles : [] | sanctions : { amende_max: null, prison_max: null }
- actions_gratuites : 3 à 4 exemples concrets de domaines pour aider l'utilisateur à se positionner (ex : "Litige consommation : remboursement, livraison, abonnement", "Travail : licenciement, heures sup, harcèlement", "Logement : caution, travaux, expulsion", "Routier : amende, retrait de points")
- demarche_disponible : false

════════════════════════════════════════
RÈGLE 2 — Victime / porter plainte / contester
════════════════════════════════════════
Si l'utilisateur est victime, veut porter plainte, contester une procédure, ou entamer une démarche contre quelqu'un :
- contexte : "victime"
- probabilite : "0%" (l'utilisateur ne risque rien, il est victime)
- sanctions : ce que risque LE COUPABLE / l'auteur des faits
- resume : explique la situation et si besoin pose UNE seule question courte pour affiner
- delai_legal : délai pour agir
- demarche_disponible : true (TOUJOURS quand l'utilisateur peut entamer une démarche concrète)
- demarche_titre / demarche_description : encourage à lancer la démarche avec AvocAI

════════════════════════════════════════
RÈGLE 3 — Infraction commise (analyse standard)
════════════════════════════════════════
Si l'utilisateur décrit un fait qu'il a commis :
- contexte : "mis_en_cause"
- DISTINGUE INTENTIONNEL vs ACCIDENTEL : un fait accidentel relève souvent de la responsabilité civile (assurance), pas du pénal. Les sanctions pénales ne s'appliquent qu'en cas d'intention, négligence grave, ou mise en danger.
- Si accidentel sans intention ni mise en danger d'autrui : sanctions pénales souvent NULLES (amende_max: null, prison_max: null), responsabilité civile uniquement
- demarche_disponible : true dès qu'une démarche utile existe (déclaration assurance, médiation, contestation, etc.)

════════════════════════════════════════
CALIBRATION probabilite (= chances RÉELLES de poursuites)
════════════════════════════════════════
IMPORTANT : la "probabilite" représente le risque RÉEL d'être poursuivi en pratique, pas le risque théorique. Sois RÉALISTE.

- Situation anodine, accident sans victime, victime de l'autre côté : "0%"
- Fait involontaire / accidentel sans dommage corporel ni plainte : "0%"–"3%"
- Infraction mineure involontaire (ex : négligence) : "2%"–"8%"
- Infraction mineure intentionnelle sans victime ni signalement : "5%"–"15%"
- Infraction moyenne intentionnelle, sans plainte connue : "10%"–"25%"
- Infraction avec victime identifiée, sans plainte déposée : "15%"–"35%"
- Infraction avec plainte déposée ou flagrant délit : "40%"–"65%"
- Délit grave avec preuves matérielles : "55%"–"75%"
- Crime grave avec aveux ou preuves accablantes : "75%"–"90%"
- Homicide, viol, crime organisé avec preuves : "85%"–"95%"

NE JAMAIS dépasser 50% sans qu'il y ait : plainte déposée, flagrant délit, preuves matérielles, ou aveux explicites.

════════════════════════════════════════
CALIBRATION sanctions (réalisme avant tout)
════════════════════════════════════════
- Indique le MAXIMUM légal théorique, mais NE FORCE PAS les sanctions pénales si le fait est accidentel/civil.
- Pour un accident sans victime corporelle : amende_max et prison_max peuvent être null si seule la responsabilité civile est engagée.
- Si un dommage matériel est accidentel et couvert par l'assurance, indique-le clairement dans le resume.

════════════════════════════════════════
DÉMARCHE — Propose-la TRÈS souvent
════════════════════════════════════════
Mets demarche_disponible = true dès qu'une action concrète est envisageable :
- Contester une décision (amende, licenciement, refus, etc.)
- Demander un remboursement, une indemnité, une caution
- Porter plainte, signaler un harcèlement
- Entamer une procédure (divorce, pension, mise en demeure)
- Récupérer des points, contester des points
- Signaler un sinistre / déclarer à l'assurance
- Toute situation où un courrier officiel ou un dossier juridique aide

Le titre doit être ACTION-ORIENTÉ ("Contestez cette amende", "Récupérez votre caution", "Lancez votre démarche officielle") et le bouton mène vers la constitution de dossier guidée.

════════════════════════════════════════
STRUCTURE JSON DE RÉPONSE
════════════════════════════════════════

{
  "contexte": "mis_en_cause",
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

sanctions.amende_max : montant maximum de l'amende encourue, ou null.
sanctions.prison_max : peine maximale de prison, ou null.
demarche_disponible : true seulement si une démarche officielle concrète est possible.
Réponds UNIQUEMENT en JSON valide, sans markdown, sans balises \`\`\`.`;

// ── POST /api/chat (auth + quota + persistance) ─────────
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
    convId = Number(r.lastInsertRowid);
  }

  // Chargement de l'historique AVANT d'insérer le nouveau message
  const history = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC'
  ).all(convId);

  // Sauvegarde du message utilisateur
  db.prepare('INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)')
    .run(convId, 'user', JSON.stringify({ text: message.trim() }));

  // Construction des messages pour OpenAI (historique + nouveau message)
  const historyMessages = history.map(m => {
    try {
      const parsed = JSON.parse(m.content);
      const content = m.role === 'user'
        ? (parsed.text || m.content)
        : JSON.stringify(parsed);
      return { role: m.role === 'ai' ? 'assistant' : 'user', content };
    } catch {
      return { role: m.role === 'ai' ? 'assistant' : 'user', content: m.content };
    }
  });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1024,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...historyMessages,
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

    res.json({ ...data, conversation_id: convId, quota: req.quotaInfo });
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

// ── POST /api/chat/guest (1 requête max par IP par jour) ─
app.post('/api/chat/guest', async (req, res) => {
  const ip = getClientIP(req);
  const today = todayUTC();

  db.prepare('INSERT OR IGNORE INTO guest_requests (ip, date, count) VALUES (?, ?, 0)').run(ip, today);
  const record = db.prepare('SELECT count FROM guest_requests WHERE ip = ? AND date = ?').get(ip, today);

  if (record && record.count >= 1) {
    return res.status(429).json({
      error: 'Vous avez utilisé votre analyse gratuite. Créez un compte pour continuer.',
      exhausted: true,
    });
  }

  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Le champ "message" est requis.' });
  }

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
    try { data = JSON.parse(cleaned); }
    catch { return res.status(500).json({ error: 'Réponse IA invalide. Veuillez réessayer.' }); }

    db.prepare('UPDATE guest_requests SET count = count + 1 WHERE ip = ? AND date = ?').run(ip, today);
    res.json({ ...data, guest: true });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: `Erreur OpenAI (${status}): ${err.message || 'Veuillez réessayer.'}` });
  }
});

// ── GET /api/stripe-config ──────────────────────────────
app.get('/api/stripe-config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null });
});

// ── POST /api/create-subscription-intent ────────────────
app.post('/api/create-subscription-intent', requireAuth, async (req, res) => {
  const { plan = 'pro' } = req.body || {};
  const PRICE_IDS = {
    pro:      process.env.STRIPE_PRICE_ID_PREMIUM,
    pro_plus: process.env.STRIPE_PRICE_ID_PREMIUM_PLUS,
  };
  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(503).json({ error: `Prix Stripe non configuré pour "${plan}".` });

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  try {
    // Crée ou récupère le customer Stripe
    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email });
      customerId = customer.id;
      db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, req.user.id);
    }

    // Crée la subscription (incomplète, en attente de paiement)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    db.prepare('UPDATE users SET stripe_subscription_id = ? WHERE id = ?').run(subscription.id, req.user.id);

    res.json({
      subscriptionId: subscription.id,
      clientSecret: subscription.latest_invoice.payment_intent.client_secret,
    });
  } catch (err) {
    console.error('Stripe subscription error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/activate-plan ─────────────────────────────
// Appelé depuis success.html pour activer le plan sans webhook (utile en local)
app.post('/api/activate-plan', requireAuth, async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe non configuré' });
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user.stripe_subscription_id) return res.status(400).json({ error: 'Aucun abonnement trouvé' });
  try {
    const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if (sub.status === 'active' || sub.status === 'trialing') {
      const priceId = sub.items.data[0]?.price?.id;
      const plan = priceId === process.env.STRIPE_PRICE_ID_PREMIUM_PLUS ? 'pro_plus' : 'pro';
      db.prepare('UPDATE users SET plan = ? WHERE id = ?').run(plan, req.user.id);
      const updated = db.prepare('SELECT id, email, firstName, lastName, plan FROM users WHERE id = ?').get(req.user.id);
      return res.json({ success: true, plan, user: updated });
    }
    res.json({ success: false, status: sub.status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/stripe-webhook ─────────────────────────────
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.json({ received: true });

  let event;
  try {
    event = Stripe(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === 'invoice.payment_succeeded') {
    const subscriptionId = event.data.object.subscription;
    const priceId = event.data.object.lines?.data?.[0]?.price?.id;
    const plan = priceId === process.env.STRIPE_PRICE_ID_PREMIUM_PLUS ? 'pro_plus' : 'pro';
    db.prepare('UPDATE users SET plan = ? WHERE stripe_subscription_id = ?').run(plan, subscriptionId);
  }

  if (event.type === 'customer.subscription.deleted') {
    const subscriptionId = event.data.object.id;
    db.prepare('UPDATE users SET plan = "free" WHERE stripe_subscription_id = ?').run(subscriptionId);
  }

  res.json({ received: true });
});

// ── POST /api/create-checkout ───────────────────────────
app.post('/api/create-checkout', async (req, res) => {
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: 'Paiement non configuré (clé Stripe manquante).' });
  }

  const { plan = 'pro' } = req.body || {};

  const PRICE_IDS = {
    pro:      process.env.STRIPE_PRICE_ID_PREMIUM      || process.env.STRIPE_PRICE_ID,
    pro_plus: process.env.STRIPE_PRICE_ID_PREMIUM_PLUS || null,
  };

  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    return res.status(503).json({ error: `Prix Stripe non configuré pour le plan "${plan}".` });
  }

  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.SUCCESS_URL || 'http://localhost:3000/success'}?plan=${plan}`,
      cancel_url: process.env.CANCEL_URL || 'http://localhost:3000/pricing',
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    const msg = err.message?.includes('No such price')
      ? 'STRIPE_PRICE_ID invalide — utilise un ID commençant par price_.'
      : `Impossible de créer la session de paiement: ${err.message}`;
    res.status(500).json({ error: msg });
  }
});

// ── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ AvocAI server running at http://localhost:${PORT}\n`);
  if (!GOOGLE_CLIENT_ID) console.warn('⚠ GOOGLE_CLIENT_ID non défini — auth Google désactivée');
});
