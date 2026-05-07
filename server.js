require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const Stripe = require('stripe');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('./db');

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Sécurité : trust proxy (pour rate-limit derrière reverse proxy) ──
app.set('trust proxy', 1);

// ── Sécurité : headers (Helmet) ─────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://unpkg.com', 'https://cdnjs.cloudflare.com', 'https://js.stripe.com', 'https://accounts.google.com'],
      styleSrc:  ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:   ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:    ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc:["'self'", 'https://api.openai.com', 'https://api.stripe.com', 'https://geo.api.gouv.fr', 'https://api-adresse.data.gouv.fr', 'https://nominatim.openstreetmap.org', 'https://overpass-api.de'],
      frameSrc:  ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com', 'https://accounts.google.com'],
      objectSrc: ["'none'"],
      baseUri:   ["'self'"],
      formAction:["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,        // permet les CDN externes
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }, // permet OAuth popups
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// ── Sécurité : CORS — restreint aux origines autorisées ──
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Pas d'origin = appel direct (curl, mobile) → autorisé en dev
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*')) return cb(null, true);
    return cb(new Error('CORS non autorisé pour : ' + origin));
  },
  credentials: true,
}));

// ── Body parser : limite la taille pour éviter DoS ─────
app.use(express.json({ limit: '256kb' }));
app.use(express.static(path.join(__dirname), {
  // Pas de cache HTML pour éviter de servir une vieille version après deploy
  setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); },
}));

// ── Sécurité : rate limiters ────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,                  // 10 tentatives login/register par IP / 15min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
});

const verifyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1h
  max: 8,                   // 8 demandes de code/heure
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes de code. Réessayez plus tard.' },
});

const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 6,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de messages envoyés. Réessayez dans une heure.' },
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,      // 1 min
  max: 60,                  // 60 req/min/IP — anti-spam global
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes. Ralentissez.' },
});
app.use('/api/', apiLimiter);

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('✗ JWT_SECRET manquant dans .env');
  process.exit(1);
}
if (JWT_SECRET.length < 32) {
  console.error('✗ JWT_SECRET trop court (min 32 caractères pour la prod).');
  if (IS_PROD) process.exit(1);
}
const JWT_EXPIRES = '7d';

// ── Sécurité : verrouillage compte après tentatives échouées ──
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min

function recordFailedLogin(email) {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO login_attempts (email, count, first_at) VALUES (?, 0, ?)').run(email, now);
  const row = db.prepare('SELECT count, first_at FROM login_attempts WHERE email = ?').get(email);
  if (now - row.first_at > LOCKOUT_WINDOW_MS) {
    db.prepare('UPDATE login_attempts SET count = 1, first_at = ? WHERE email = ?').run(now, email);
  } else {
    db.prepare('UPDATE login_attempts SET count = count + 1 WHERE email = ?').run(email);
  }
}
function isLockedOut(email) {
  const row = db.prepare('SELECT count, first_at FROM login_attempts WHERE email = ?').get(email);
  if (!row) return false;
  if (Date.now() - row.first_at > LOCKOUT_WINDOW_MS) return false;
  return row.count >= LOCKOUT_THRESHOLD;
}
function resetFailedLogins(email) {
  db.prepare('DELETE FROM login_attempts WHERE email = ?').run(email);
}

// ── Sécurité : validation entrées ──────────────────────
function validateEmail(e)    { return typeof e === 'string' && validator.isEmail(e) && e.length <= 254; }
function validatePassword(p) {
  if (typeof p !== 'string' || p.length < 8 || p.length > 128) return false;
  // Au moins une lettre + un chiffre
  return /[A-Za-z]/.test(p) && /\d/.test(p);
}
function sanitizeName(n) { return String(n||'').trim().replace(/[<>"'`]/g, '').slice(0, 80); }
function sanitizeText(t, maxLen = 5000) { return String(t||'').slice(0, maxLen); }

// ── Audit log ──────────────────────────────────────────
function audit(userId, action, meta) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, action, meta, ip, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId || null, action, meta ? JSON.stringify(meta).slice(0, 1000) : null, null, Date.now());
  } catch (e) { console.error('Audit error:', e.message); }
}

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
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, password, firstName, lastName, birthDate } = req.body || {};
  if (!validateEmail(email))    return res.status(400).json({ error: 'Email invalide.' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'Mot de passe : 8 caractères min, 1 lettre + 1 chiffre.' });
  const fn = sanitizeName(firstName);
  const ln = sanitizeName(lastName);
  if (!fn || !ln) return res.status(400).json({ error: 'Prénom et nom requis.' });
  if (!birthDate || !/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) return res.status(400).json({ error: 'Date de naissance invalide (JJ/MM/AAAA).' });

  const lower = email.toLowerCase().trim();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(lower);
  if (existing) return res.status(409).json({ error: 'Email déjà utilisé.' });

  try {
    const hash = await bcrypt.hash(password, 12); // cost 12 = ~250ms, anti brute-force
    const r = db.prepare('INSERT INTO users (email, password_hash, first_name, last_name, birth_date) VALUES (?, ?, ?, ?, ?)').run(lower, hash, fn, ln, birthDate);
    const userId = Number(r.lastInsertRowid);
    const token = jwt.sign({ id: userId, email: lower }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    audit(userId, 'register', { email: lower });
    res.json({ token, user: { id: userId, email: lower, plan: 'free', firstName: fn, lastName: ln } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte.' });
  }
});

// ── Auth: Login ─────────────────────────────────────────
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!validateEmail(email) || typeof password !== 'string' || password.length === 0) {
    return res.status(400).json({ error: 'Email ou mot de passe invalide.' });
  }

  const lower = email.toLowerCase().trim();

  if (isLockedOut(lower)) {
    audit(null, 'login_locked', { email: lower });
    return res.status(429).json({ error: 'Compte temporairement verrouillé suite à trop de tentatives. Réessayez dans 15 minutes.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(lower);
  if (!user) {
    recordFailedLogin(lower);
    // Délai constant : empêche l'énumération d'emails par mesure de timing
    await bcrypt.compare(password, '$2a$12$' + 'x'.repeat(53));
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  if (!user.password_hash) {
    return res.status(401).json({ error: 'Ce compte utilise la connexion Google.' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    recordFailedLogin(lower);
    audit(user.id, 'login_failed', { email: lower });
    return res.status(401).json({ error: 'Identifiants invalides.' });
  }

  resetFailedLogins(lower);
  const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  audit(user.id, 'login_success');
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
    const { sub: googleId, email, given_name, family_name, picture } = payload;
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
        db.prepare('UPDATE users SET google_id = ?, first_name = COALESCE(first_name, ?), last_name = COALESCE(last_name, ?), birth_date = COALESCE(birth_date, ?), avatar_url = COALESCE(avatar_url, ?), email_verified = 1 WHERE id = ?')
          .run(googleId, given_name || null, family_name || null, birthDate, picture || null, user.id);
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
      }
    }

    // 3. Création d'un nouveau compte (email considéré vérifié par Google)
    if (!user) {
      const r = db.prepare(
        "INSERT INTO users (email, password_hash, google_id, first_name, last_name, birth_date, avatar_url, email_verified) VALUES (?, '', ?, ?, ?, ?, ?, 1)"
      ).run(lower, googleId, given_name || null, family_name || null, birthDate, picture || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(r.lastInsertRowid));
    }

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const userData = encodeURIComponent(JSON.stringify({
      id: user.id, email: user.email, plan: user.plan,
      firstName: user.first_name, lastName: user.last_name,
      avatarUrl: user.avatar_url,
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
  const user = db.prepare('SELECT id, email, plan, first_name, last_name, birth_date, phone, email_verified, avatar_url, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  res.json({ user: {
    id: user.id, email: user.email, plan: user.plan,
    firstName: user.first_name, lastName: user.last_name,
    birthDate: user.birth_date, phone: user.phone,
    emailVerified: !!user.email_verified,
    avatarUrl: user.avatar_url,
    createdAt: user.created_at,
  } });
});

// Upload avatar (data URL JPEG/PNG/WebP, max 500KB)
app.put('/api/auth/avatar', requireAuth, express.json({ limit: '1mb' }), (req, res) => {
  const { avatarUrl } = req.body || {};
  if (!avatarUrl || typeof avatarUrl !== 'string') return res.status(400).json({ error: 'Avatar manquant.' });
  if (!/^data:image\/(jpeg|jpg|png|webp);base64,/.test(avatarUrl)) {
    return res.status(400).json({ error: 'Format invalide (JPEG/PNG/WebP requis).' });
  }
  if (avatarUrl.length > 700_000) return res.status(400).json({ error: 'Image trop volumineuse (max 500KB après compression).' });
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
  audit(req.user.id, 'avatar_update');
  res.json({ ok: true });
});

app.delete('/api/auth/avatar', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
  audit(req.user.id, 'avatar_delete');
  res.json({ ok: true });
});

// Mise à jour du profil
app.put('/api/auth/me', requireAuth, (req, res) => {
  const fn = sanitizeName(req.body?.firstName);
  const ln = sanitizeName(req.body?.lastName);
  const bd = req.body?.birthDate;
  const ph = String(req.body?.phone || '').trim().replace(/[^\d +]/g, '').slice(0, 20);
  if (!fn) return res.status(400).json({ error: 'Prénom requis.' });
  if (!ln) return res.status(400).json({ error: 'Nom requis.' });
  if (bd && !/^\d{2}\/\d{2}\/\d{4}$/.test(bd)) return res.status(400).json({ error: 'Date invalide (JJ/MM/AAAA).' });
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, birth_date = ?, phone = ? WHERE id = ?')
    .run(fn, ln, bd || null, ph || null, req.user.id);
  audit(req.user.id, 'profile_update');
  res.json({ ok: true });
});

// Suppression de compte (RGPD Article 17 — Droit à l'effacement)
app.delete('/api/auth/me', requireAuth, async (req, res) => {
  const { password, confirmation } = req.body || {};
  if (confirmation !== 'SUPPRIMER') {
    return res.status(400).json({ error: 'Confirmation invalide. Tapez SUPPRIMER pour confirmer.' });
  }

  const user = db.prepare('SELECT id, email, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable.' });

  // Si compte avec mot de passe, on exige le mot de passe pour la confirmation
  if (user.password_hash) {
    if (!password) return res.status(400).json({ error: 'Mot de passe requis pour confirmer.' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      audit(user.id, 'account_delete_wrong_password');
      return res.status(401).json({ error: 'Mot de passe incorrect.' });
    }
  }

  // Trace l'action AVANT suppression (audit conservé sans user_id)
  audit(user.id, 'account_delete', { email: user.email });

  try {
    // 1) Anonymise l'audit log (RGPD : on conserve les logs admin sans PII)
    db.prepare('UPDATE audit_log SET user_id = NULL WHERE user_id = ?').run(user.id);
    // 2) Nettoie les login_attempts (table sans FK)
    db.prepare('DELETE FROM login_attempts WHERE email = ?').run(user.email);
    // 3) Supprime le user — CASCADE sur conversations, messages, dossiers, daily_requests
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
    res.json({ ok: true });
  } catch (e) {
    console.error('Account delete error:', e);
    res.status(500).json({ error: 'Erreur lors de la suppression. Contactez le support.' });
  }
});

// Vérification email — demande de code
app.post('/api/auth/email/verify-request', verifyLimiter, requireAuth, (req, res) => {
  const u = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(req.user.id);
  if (!u) return res.status(404).json({ error: 'Utilisateur introuvable.' });
  if (u.email_verified) return res.status(400).json({ error: 'Email déjà vérifié.' });
  const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
  const expires = Date.now() + 10 * 60 * 1000; // 10 minutes
  db.prepare('UPDATE users SET verify_code = ?, verify_expires = ? WHERE id = ?').run(code, expires, req.user.id);
  console.log(`[VERIFY] Code pour ${u.email} : ${code} (10 min)`);
  // TODO en prod : envoyer le code par email via SMTP/Resend.
  // En dev, on retourne le code dans la réponse pour permettre la vérification immédiate.
  res.json({ ok: true, devCode: process.env.NODE_ENV === 'production' ? undefined : code });
});

// Vérification email — validation
app.post('/api/auth/email/verify-confirm', requireAuth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code requis.' });
  const u = db.prepare('SELECT verify_code, verify_expires FROM users WHERE id = ?').get(req.user.id);
  if (!u?.verify_code) return res.status(400).json({ error: 'Aucun code en attente. Demandez-en un nouveau.' });
  if (Date.now() > (u.verify_expires || 0)) return res.status(400).json({ error: 'Code expiré. Demandez-en un nouveau.' });
  if (String(code).trim() !== u.verify_code) return res.status(400).json({ error: 'Code incorrect.' });
  db.prepare('UPDATE users SET email_verified = 1, verify_code = NULL, verify_expires = NULL WHERE id = ?').run(req.user.id);
  res.json({ ok: true });
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

// ── Dossiers ────────────────────────────────────────────
app.get('/api/dossiers', requireAuth, (req, res) => {
  const rows = db.prepare(
    'SELECT id, title, category, created_at FROM dossiers WHERE user_id = ? ORDER BY id DESC'
  ).all(req.user.id);
  res.json({ dossiers: rows });
});

app.get('/api/dossiers/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM dossiers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Dossier introuvable.' });
  res.json({ dossier: { ...row, data: JSON.parse(row.data || '{}') } });
});

app.post('/api/dossiers', requireAuth, (req, res) => {
  const title    = sanitizeText(req.body?.title, 200);
  const category = sanitizeText(req.body?.category, 50);
  const data     = req.body?.data;
  if (!title.trim() || !category.trim()) return res.status(400).json({ error: 'Champs manquants.' });
  // Limite la taille du JSON pour éviter les abus
  const dataStr = JSON.stringify(data || {}).slice(0, 50000);
  const result = db.prepare(
    'INSERT INTO dossiers (user_id, title, category, data) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, title.trim(), category.trim(), dataStr);
  audit(req.user.id, 'dossier_create', { id: Number(result.lastInsertRowid), category });
  res.json({ id: Number(result.lastInsertRowid), title: title.trim(), category: category.trim() });
});

app.delete('/api/dossiers/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID invalide.' });
  const r = db.prepare('DELETE FROM dossiers WHERE id = ? AND user_id = ?').run(id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Dossier introuvable.' });
  audit(req.user.id, 'dossier_delete', { id });
  res.json({ ok: true });
});

// Support : enregistre la demande (à brancher sur SMTP plus tard)
app.post('/api/support', supportLimiter, requireAuth, (req, res) => {
  const subject = sanitizeText(req.body?.subject, 200);
  const message = sanitizeText(req.body?.message, 5000);
  if (!message.trim()) return res.status(400).json({ error: 'Message manquant.' });
  const userRow = db.prepare('SELECT email, plan FROM users WHERE id = ?').get(req.user.id);
  console.log(`[SUPPORT] from ${userRow?.email || req.user.id} (${userRow?.plan}): ${subject || '(no subject)'} | ${message.slice(0, 200)}`);
  audit(req.user.id, 'support_message', { subject: subject.slice(0, 50) });
  res.json({ ok: true });
});

// Middleware : Premium+ requis ET incrément quota
function requirePremiumPlusAndQuota(req, res, next) {
  const userRow = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
  if (userRow?.plan !== 'pro_plus' && userRow?.plan !== 'admin') {
    return res.status(403).json({ error: 'Réservé aux abonnés Premium+.' });
  }
  return checkQuota(req, res, next);
}

// Chat IA spécialisé pour modifier un dossier (Premium+ uniquement, compte dans le quota journalier)
app.post('/api/dossiers/:id/chat', requireAuth, requirePremiumPlusAndQuota, async (req, res) => {
  const { message, history } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Message manquant.' });

  const userRow = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);

  const row = db.prepare('SELECT * FROM dossiers WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Dossier introuvable.' });

  let dossierData;
  try { dossierData = JSON.parse(row.data || '{}'); } catch { dossierData = {}; }

  const SYSTEM = `Tu es l'assistant juridique IA spécialisé dans la modification de dossiers AvocAI.

CONTEXTE — Voici le dossier actuel de l'utilisateur (catégorie : ${row.category}, titre : ${row.title}) :
\`\`\`json
${JSON.stringify(dossierData, null, 2)}
\`\`\`

TON RÔLE :
- Aider l'utilisateur à modifier, compléter, clarifier ou améliorer ce dossier juridique.
- Répondre à ses questions sur le dossier.
- Suggérer des corrections, des ajouts pertinents.

RÈGLE STRICTE — Réponds UNIQUEMENT en JSON valide avec ce format :
{
  "reply": "Ta réponse claire et utile en français (max 4-5 phrases)",
  "updatedData": null | { ...nouveau dossier complet... }
}

Si l'utilisateur demande une modification précise (changement d'adresse, correction d'un nom, ajout d'un détail, etc.), inclus le dossier complet modifié dans "updatedData". Sinon "updatedData" doit être null.

Ne réponds JAMAIS hors JSON. Pas de markdown, pas de \`\`\`.`;

  const historyMessages = (Array.isArray(history) ? history : []).slice(-10).map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 1500,
      messages: [
        { role: 'system', content: SYSTEM },
        ...historyMessages,
        { role: 'user', content: message.trim() },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed;
    try { parsed = JSON.parse(raw); } catch { parsed = { reply: raw, updatedData: null }; }

    if (parsed.updatedData && typeof parsed.updatedData === 'object') {
      db.prepare('UPDATE dossiers SET data = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(parsed.updatedData), req.params.id, req.user.id);
    }

    res.json({ reply: parsed.reply || 'Réponse vide.', updatedData: parsed.updatedData || null });
  } catch (err) {
    console.error('Dossier chat error:', err.status, err.message);
    res.status(500).json({ error: 'Erreur IA. Veuillez réessayer.' });
  }
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
