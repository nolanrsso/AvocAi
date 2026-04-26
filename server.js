require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── Serve main pages ────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'AvocAI.html')));
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'success.html')));
app.get('/cancel', (req, res) => res.sendFile(path.join(__dirname, 'cancel.html')));

// ── Anthropic client ────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Tu es AvocAI, un assistant juridique intelligent spécialisé dans le droit français et européen.
Quand un utilisateur décrit une situation, tu dois TOUJOURS répondre avec cette structure JSON exacte :

{
  "resume": "Résumé de la situation en 1-2 phrases",
  "risque_niveau": 3,
  "risque_label": "Modéré",
  "probabilite": "Faible si contestation rapide",
  "delai_legal": "45 jours pour contester",
  "articles": [
    {
      "code": "Art. L121-3 — Code de la Route",
      "texte": "Extrait pertinent de l'article...",
      "lien": "https://www.legifrance.gouv.fr/..."
    }
  ],
  "actions_gratuites": [
    "Action possible 1",
    "Action possible 2"
  ],
  "demarche_disponible": true,
  "demarche_titre": "Contestez cette amende officiellement",
  "demarche_description": "Nous vous guidons pas à pas..."
}

risque_niveau va de 1 (très faible) à 5 (critique).
demarche_disponible est true seulement si une démarche officielle concrète est possible (contester une amende, rédiger un courrier officiel, remplir un formulaire, etc.).
Réponds UNIQUEMENT en JSON valide, sans markdown, sans balises \`\`\`.`;

// ── POST /api/chat ───────────────────────────────────────
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Le champ "message" est requis.' });
  }

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message.trim() }],
    });

    const raw = response.content[0]?.text || '';

    // Strip potential markdown code fences just in case
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

    let data;
    try {
      data = JSON.parse(cleaned);
    } catch {
      console.error('JSON parse error. Raw response:', raw);
      return res.status(500).json({ error: 'Réponse IA invalide. Veuillez réessayer.' });
    }

    res.json(data);
  } catch (err) {
    console.error('Anthropic API error:', err.status, err.message);
    const status = err.status || 500;
    res.status(status).json({
      error: status === 401
        ? 'Clé API Anthropic invalide ou manquante.'
        : `Erreur Anthropic (${status}): ${err.message || 'Veuillez réessayer.'}`,
    });
  }
});

// ── POST /api/create-checkout ────────────────────────────
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

// ── Start ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ AvocAI server running at http://localhost:${PORT}\n`);
});
