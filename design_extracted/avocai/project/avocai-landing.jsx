
// AvocAI — Landing Page

const Hero = ({ setPage }) => {
  return (
    <section style={{ background: 'var(--bg-page)', padding: '120px 24px 80px', textAlign: 'center' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {/* Badge */}
        <div style={{
          display: 'inline-block', padding: '5px 14px', borderRadius: 9999,
          border: '1px solid var(--border-default)', marginBottom: 32,
          fontSize: 12, fontWeight: 510,
          fontFeatureSettings: '"cv01","ss03"', color: "rgb(94, 106, 210)", borderColor: "rgba(0, 0, 0, 0.227)"
        }}>
          Gratuit — Analysez votre situation maintenant
        </div>

        {/* Headline */}
        <h1 style={{
          fontWeight: 510,
          color: 'var(--text-primary)', lineHeight: 1.05,
          letterSpacing: '-1.056px', margin: '0 0 20px',
          fontFeatureSettings: '"cv01","ss03"', fontSize: "55px"
        }}>
          Comprenez ce que vous risquez<br />
          Défendez-vous mieux.
        </h1>

        {/* Sub */}
        <p style={{
          fontWeight: 400, color: 'var(--text-muted)',
          lineHeight: 1.6, letterSpacing: '-0.165px',
          maxWidth: 560, margin: '0 auto 36px',
          fontFeatureSettings: '"cv01","ss03"', fontSize: "17px"
        }}>Décrivez n'importe quelle situation à AvocAI. 
Il analyse vos risques juridiques, évalue vos chances d'être controlé et vous explique les articles de loi qui s'appliquent gratuitement.

        </p>

        {/* CTAs */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          <button onClick={() => setPage('chat')} style={{
            padding: '10px 24px', borderRadius: 6, border: 'none',
            color: '#fff', cursor: 'pointer',
            fontWeight: 510, fontFeatureSettings: '"cv01","ss03"', fontSize: "18px", background: "rgb(94, 106, 210)", width: "240px"
          }}
          onMouseEnter={(e) => e.target.style.background = '#828fff'}
          onMouseLeave={(e) => e.target.style.background = '#5e6ad2'}>
            Analyser ma situation</button>
          <button style={{
            padding: '10px 24px', borderRadius: 6, border: '1px solid var(--btn-border)',
            background: 'var(--btn-bg)', color: 'var(--text-body)', cursor: 'pointer',
            fontWeight: 510, fontFeatureSettings: '"cv01","ss03"', borderColor: "rgba(0, 0, 0, 0.235)", fontSize: "19px", width: "251px"
          }}>Voir comment ça marche</button>
        </div>

        {/* Social proof */}
        <p style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-subtle)', fontFeatureSettings: '"cv01","ss03"' }}>
          Déjà +15 000 situations analysées · Droit français &amp; européen
        </p>

        {/* Demo card */}
        <DemoCard setPage={setPage} />
      </div>
    </section>);

};

const DemoCard = ({ setPage }) =>
<div style={{
  maxWidth: 680, margin: '56px auto 0',
  background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
  borderRadius: 12, overflow: 'hidden',
  boxShadow: '0px 1px 3px rgba(0,0,0,0.06), 0px 1px 2px rgba(0,0,0,0.04)',
  textAlign: 'left'
}}>
    {/* Chat header */}
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27a644' }} />
      <span style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-muted)', fontFeatureSettings: '"cv01","ss03"' }}>
        Conversation en cours
      </span>
    </div>

    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* User message */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
        background: '#5e6ad2', color: '#fff', borderRadius: 8,
        padding: '10px 14px', maxWidth: '80%',
        fontSize: 15, lineHeight: 1.5, fontFeatureSettings: '"cv01","ss03"'
      }}>
          J'ai reçu une amende pour excès de vitesse mais je n'étais pas au volant ce jour-là.
        </div>
      </div>

      {/* AI Response */}
      <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border-default)',
      borderRadius: 10, overflow: 'hidden'
    }}>
        {/* Header */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="4" fill="#5e6ad2" />
            <path d="M7 20L14 8L21 20H17.5L14 13.5L10.5 20H7Z" fill="white" fillOpacity="0.95" />
          </svg>
          <span style={{ fontSize: 12, fontWeight: 510, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, fontFeatureSettings: '"cv01","ss03"' }}>
            Analyse juridique
          </span>
        </div>

        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Risk row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontFeatureSettings: '"cv01","ss03"' }}>Risque légal</div>
              <RiskMeter level={3} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontFeatureSettings: '"cv01","ss03"' }}>Probabilité</div>
              <div style={{ fontSize: 13, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"' }}>Faible si contestation rapide</div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4, fontFeatureSettings: '"cv01","ss03"' }}>Délai légal</div>
              <div style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"' }}>45 jours pour contester</div>
            </div>
          </div>

          {/* Law article */}
          <LawBlock
          code="Art. L121-3"
          title="Code de la Route"
          excerpt={"Le titulaire du certificat d'immatriculation peut s'exonérer de sa responsabilité en désignant l'auteur réel de l'infraction..."} />
        

          {/* Premium upsell */}
          <PremiumBlock
          title="Contestez cette amende officiellement"
          body="Nous vous guidons pas à pas pour contester. Formulaire pré-rempli + lettre type inclus."
          cta="Commencer la démarche →" />
        
        </div>
      </div>
    </div>
  </div>;


const Pricing = ({ setPage }) => {
  const check = <span style={{ color: '#27a644', marginRight: 8 }}>✓</span>;
  const features = {
    free: ['Analyse juridique illimitée', 'Évaluation des risques', 'Références aux articles de loi', 'Probabilité de poursuite', 'Historique des 7 derniers jours'],
    pro: ['Tout le plan gratuit', 'Aide au remplissage de démarches', 'Formulaires officiels pré-remplis', 'Lettres types générées par IA', 'Suivi de dossier pas à pas', 'Alertes délais légaux', 'Historique illimité']
  };
  return (
    <section style={{ background: 'var(--bg-page)', padding: '80px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.704px', marginBottom: 12, fontFeatureSettings: '"cv01","ss03"' }}>
          Tarifs
        </h2>
        <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 48, fontFeatureSettings: '"cv01","ss03"' }}>
          Commencez gratuitement, passez à Pro quand vous en avez besoin.
        </p>
        <div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 800, margin: '0 auto' }}>
          {/* Free */}
          <div style={{
            flex: '1 1 300px', maxWidth: 360,
            background: 'var(--btn-bg)', border: '1px solid var(--border-default)',
            borderRadius: 8, padding: 32, textAlign: 'left'
          }}>
            <div style={{ fontSize: 24, fontWeight: 400, color: 'var(--text-primary)', marginBottom: 8, fontFeatureSettings: '"cv01","ss03"' }}>Gratuit</div>
            <div style={{ fontSize: 48, fontWeight: 510, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 24, fontFeatureSettings: '"cv01","ss03"' }}>0€</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {features.free.map((f) =>
              <div key={f} style={{ fontSize: 15, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"' }}>{check}{f}</div>
              )}
            </div>
            <button onClick={() => setPage('chat')} style={{
              width: '100%', padding: '9px 16px', borderRadius: 6,
              border: '1px solid var(--btn-border)', background: 'var(--btn-bg)',
              color: 'var(--text-body)', cursor: 'pointer',
              fontSize: 14, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"'
            }}>Commencer gratuitement</button>
          </div>

          {/* Pro */}
          <div style={{
            flex: '1 1 300px', maxWidth: 360,
            background: 'var(--btn-bg)', border: '1px solid #5e6ad2',
            borderRadius: 8, padding: 32, textAlign: 'left', position: 'relative'
          }}>
            <div style={{
              position: 'absolute', top: -12, right: 20,
              background: '#5e6ad2', color: '#fff',
              padding: '4px 12px', borderRadius: 9999,
              fontSize: 12, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"'
            }}>Le plus populaire</div>
            <div style={{ fontSize: 24, fontWeight: 400, color: 'var(--text-primary)', marginBottom: 4, fontFeatureSettings: '"cv01","ss03"' }}>AvocAI Pro</div>
            <div style={{ fontSize: 48, fontWeight: 510, color: 'var(--text-primary)', lineHeight: 1, marginBottom: 4, fontFeatureSettings: '"cv01","ss03"', width: "295px" }}>1,49€<span style={{ fontSize: 30, fontWeight: 590, opacity: 1 }}>/semaine</span><span style={{ fontSize: 18, fontWeight: 400 }}></span></div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, fontFeatureSettings: '"cv01","ss03"' }}>ou 79€/an · Résiliable à tout moment</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
              {features.pro.map((f) =>
              <div key={f} style={{ fontSize: 15, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"' }}>{check}{f}</div>
              )}
            </div>
            <button style={{
              width: '100%', padding: '9px 16px', borderRadius: 6,
              border: 'none', background: '#5e6ad2',
              color: '#fff', cursor: 'pointer',
              fontSize: 14, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"'
            }}
            onMouseEnter={(e) => e.target.style.background = '#828fff'}
            onMouseLeave={(e) => e.target.style.background = '#5e6ad2'}>
              Passer à Pro</button>
          </div>
        </div>
      </div>
    </section>);

};

const HowItWorks = () => {
  const steps = [
  { n: '01', title: 'Décrivez votre situation', body: 'Écrivez librement, comme à un ami. Pas besoin de jargon juridique.' },
  { n: '02', title: 'AvocAI analyse en temps réel', body: "L'IA identifie les lois applicables, évalue vos risques et calcule vos chances." },
  { n: '03', title: 'Défendez-vous si nécessaire', body: "Passez au Pro pour que l'IA remplisse vos démarches officielles à votre place." }];

  return (
    <section style={{ background: 'var(--bg-panel)', padding: '80px 24px', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.704px', marginBottom: 48, fontFeatureSettings: '"cv01","ss03"' }}>
          Comment ça marche
        </h2>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {steps.map((s) =>
          <div key={s.n} style={{
            flex: '1 1 240px', maxWidth: 320,
            background: 'var(--btn-bg)', border: '1px solid var(--border-default)',
            borderRadius: 8, padding: 28, textAlign: 'left', color: "rgb(130, 143, 255)"
          }}>
              <div style={{ fontSize: 48, fontWeight: 510, color: '#5e6ad2', lineHeight: 1, marginBottom: 12, fontFeatureSettings: '"cv01","ss03"' }}>{s.n}</div>
              <div style={{ fontSize: 20, fontWeight: 590, color: 'var(--text-primary)', marginBottom: 10, letterSpacing: '-0.24px', fontFeatureSettings: '"cv01","ss03"' }}>{s.title}</div>
              <div style={{ fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, fontFeatureSettings: '"cv01","ss03"' }}>{s.body}</div>
            </div>
          )}
        </div>
      </div>
    </section>);

};

const UseCases = () => {
  const pills = ['Amende contestée', 'Litige locataire', 'Conflit au travail', 'Accident de la route', 'Problème de voisinage', 'Garde à vue', 'Contrat litigieux', 'Amende contestée', 'Impayés', 'Licenciement abusif', 'Discrimination', 'Arnaque en ligne'];
  const [active, setActive] = React.useState(null);
  return (
    <section style={{ background: 'var(--bg-page)', padding: '64px 24px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', textAlign: 'center' }}>
        <h2 style={{ fontSize: 24, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.288px', marginBottom: 28, fontFeatureSettings: '"cv01","ss03"' }}>
          Situations courantes analysées par AvocAI
        </h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
          {pills.map((p) =>
          <button key={p} onClick={() => setActive(p === active ? null : p)} style={{
            padding: '7px 16px', borderRadius: 9999,
            border: `1px solid ${p === active ? '#5e6ad2' : 'var(--border-default)'}`,
            background: p === active ? 'rgba(94,106,210,0.08)' : 'var(--btn-bg)',
            color: p === active ? '#7170ff' : 'var(--text-body)',
            cursor: 'pointer', fontSize: 13, fontWeight: 510,
            fontFeatureSettings: '"cv01","ss03"',
            transition: 'all 0.15s ease'
          }}>{p}</button>
          )}
        </div>
      </div>
    </section>);

};

const FAQ = () => {
  const [open, setOpen] = React.useState(null);
  const items = [
  { q: "AvocAI remplace-t-il un vrai avocat ?", a: "Non. AvocAI est un outil d'information juridique. Pour une procédure judiciaire formelle, consultez toujours un avocat qualifié." },
  { q: "Mes conversations sont-elles confidentielles ?", a: "Oui. Vos données sont chiffrées et ne sont jamais partagées avec des tiers." },
  { q: "Pour quel pays AvocAI fonctionne-t-il ?", a: "AvocAI est spécialisé dans le droit français et les réglementations européennes." },
  { q: "Comment fonctionne l'aide aux démarches Pro ?", a: "L'IA détecte quand votre situation nécessite une action officielle et vous guide formulaire par formulaire, avec les textes pré-remplis." }];

  return (
    <section style={{ background: 'var(--bg-page)', padding: '80px 24px', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2 style={{ fontSize: 32, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.704px', marginBottom: 40, textAlign: 'center', fontFeatureSettings: '"cv01","ss03"' }}>
          Questions fréquentes
        </h2>
        {items.map((item, i) =>
        <div key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <button onClick={() => setOpen(open === i ? null : i)} style={{
            width: '100%', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', padding: '18px 0', background: 'none',
            border: 'none', cursor: 'pointer', textAlign: 'left'
          }}>
              <span style={{ fontSize: 16, fontWeight: 510, color: 'var(--text-primary)', fontFeatureSettings: '"cv01","ss03"' }}>{item.q}</span>
              <span style={{ fontSize: 18, color: 'var(--text-muted)', flexShrink: 0, marginLeft: 16 }}>{open === i ? '−' : '+'}</span>
            </button>
            {open === i &&
          <div style={{ paddingBottom: 18, fontSize: 15, color: 'var(--text-muted)', lineHeight: 1.6, fontFeatureSettings: '"cv01","ss03"' }}>
                {item.a}
              </div>
          }
          </div>
        )}
      </div>
    </section>);

};

const Footer = () =>
<footer style={{ background: 'var(--bg-panel)', borderTop: '1px solid var(--border-subtle)', padding: '48px 24px 24px' }}>
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40, marginBottom: 40 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 590, color: 'var(--text-primary)', marginBottom: 8, fontFeatureSettings: '"cv01","ss03"' }}>AvocAI</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, fontFeatureSettings: '"cv01","ss03"' }}>Comprenez vos droits.<br />Défendez-vous.</div>
        </div>
        {[
      { title: 'Produit', links: ['Fonctionnalités', 'Tarifs', 'Changelog'] },
      { title: 'Légal', links: ['Mentions légales', 'Confidentialité', 'CGU'] },
      { title: 'Contact', links: ['Support', 'Presse', 'Partenaires'] }].
      map((col) =>
      <div key={col.title}>
            <div style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-primary)', marginBottom: 12, fontFeatureSettings: '"cv01","ss03"' }}>{col.title}</div>
            {col.links.map((l) =>
        <a key={l} href="#" onClick={(e) => e.preventDefault()} style={{
          display: 'block', fontSize: 14, color: 'var(--text-muted)',
          textDecoration: 'none', marginBottom: 8, fontFeatureSettings: '"cv01","ss03"'
        }}
        onMouseEnter={(e) => e.target.style.color = '#7170ff'}
        onMouseLeave={(e) => e.target.style.color = 'var(--text-muted)'}>
          {l}</a>
        )}
          </div>
      )}
      </div>
      <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 20 }}>
        <p style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', fontFeatureSettings: '"cv01","ss03"' }}>
          © 2025 AvocAI · AvocAI n'est pas un cabinet d'avocats et ne fournit pas de conseil juridique.
        </p>
      </div>
    </div>
  </footer>;


const LandingPage = ({ setPage }) =>
<div>
    <Hero setPage={setPage} />
    <HowItWorks />
    <Pricing setPage={setPage} />
    <UseCases />
    <FAQ />
    <Footer />
  </div>;


Object.assign(window, { LandingPage });