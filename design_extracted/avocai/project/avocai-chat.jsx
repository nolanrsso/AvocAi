
// AvocAI — Chat Interface (Page 2)

const conversations = [
  { id: 1, title: "Amende excès de vitesse", preview: "J'ai reçu une amende...", active: true },
  { id: 2, title: "Litige avec propriétaire", preview: "Mon propriétaire refuse...", active: false },
  { id: 3, title: "Conflit au travail", preview: "Mon employeur m'a...", active: false },
];

const DEMO_MESSAGES = [
  {
    role: 'user',
    text: "J'ai reçu une amende pour excès de vitesse mais je n'étais pas au volant ce jour-là.",
  },
  {
    role: 'ai',
    summary: "Vous pouvez contester cette amende en désignant le conducteur réel au moment des faits. La loi vous y autorise explicitement.",
    risk: 3,
    probability: "Faible si contestation rapide",
    delai: "45 jours pour contester",
    articles: [
      {
        code: "Art. L121-3",
        title: "Code de la Route",
        excerpt: "Le titulaire du certificat d'immatriculation peut s'exonérer de sa responsabilité en désignant l'auteur réel de l'infraction dans un délai de 45 jours.",
      },
    ],
    actions: [
      "Rédiger un courrier de désignation du conducteur réel",
      "Joindre une copie du permis du conducteur désigné",
      "Envoyer en recommandé avec accusé de réception",
    ],
    premium: true,
  },
];

const TypingIndicator = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '12px 16px' }}>
    {[0,1,2].map(i => (
      <div key={i} style={{
        width: 7, height: 7, borderRadius: '50%', background: 'var(--text-subtle)',
        animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
      }} />
    ))}
  </div>
);

const AIMessageCard = ({ msg }) => (
  <div style={{ maxWidth: '88%' }}>
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-default)',
      borderRadius: 12, overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'var(--bg-panel)',
      }}>
        <svg width="14" height="14" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="4" fill="#5e6ad2"/>
          <path d="M7 20L14 8L21 20H17.5L14 13.5L10.5 20H7Z" fill="white" fillOpacity="0.95"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.6, fontFeatureSettings: '"cv01","ss03"' }}>
          Analyse de situation
        </span>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Summary */}
        <p style={{ fontSize: 15, color: 'var(--text-body)', lineHeight: 1.6, margin: 0, fontFeatureSettings: '"cv01","ss03"' }}>
          {msg.summary}
        </p>

        {/* Risk panel */}
        <div style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border-default)',
          borderRadius: 8, padding: '12px 16px',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, fontFeatureSettings: '"cv01","ss03"' }}>Risque juridique</div>
            <RiskMeter level={msg.risk} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, fontFeatureSettings: '"cv01","ss03"' }}>Probabilité</div>
            <div style={{ fontSize: 13, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"' }}>{msg.probability}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, fontFeatureSettings: '"cv01","ss03"' }}>Délai d'action</div>
            <div style={{ fontSize: 13, fontWeight: 510, color: '#f59e0b', fontFeatureSettings: '"cv01","ss03"' }}>{msg.delai}</div>
          </div>
        </div>

        {/* Section: Articles */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontFeatureSettings: '"cv01","ss03"' }}>
            Articles de loi applicables
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {msg.articles.map((a, i) => (
              <LawBlock key={i} {...a} />
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, fontFeatureSettings: '"cv01","ss03"' }}>
            Ce que vous pouvez faire
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msg.actions.map((a, i) => (
              <div key={i} style={{ fontSize: 14, color: 'var(--text-body)', display: 'flex', gap: 8, alignItems: 'flex-start', fontFeatureSettings: '"cv01","ss03"' }}>
                <span style={{ color: '#27a644', flexShrink: 0, marginTop: 1 }}>·</span> {a}
              </div>
            ))}
          </div>
        </div>

        {/* Premium */}
        {msg.premium && (
          <PremiumBlock
            title="Contestez cette amende officiellement"
            body="Nous vous guidons pas à pas : formulaire pré-rempli, lettre type générée par IA, et suivi du dossier inclus."
            cta="Commencer la démarche →"
          />
        )}
      </div>
    </div>
  </div>
);

const EmptyState = ({ onSuggestion }) => {
  const suggestions = ['Amende contestée', 'Litige locataire', 'Conflit au travail', 'Accident de la route', 'Harcèlement', 'Impayés'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 40, textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 28 28" fill="none" style={{ marginBottom: 20, opacity: 0.4 }}>
        <rect width="28" height="28" rx="6" fill="#5e6ad2"/>
        <path d="M7 20L14 8L21 20H17.5L14 13.5L10.5 20H7Z" fill="white" fillOpacity="0.95"/>
        <circle cx="14" cy="20" r="1.5" fill="#7170ff"/>
      </svg>
      <h2 style={{ fontSize: 32, fontWeight: 400, color: 'var(--text-primary)', letterSpacing: '-0.704px', marginBottom: 12, fontFeatureSettings: '"cv01","ss03"' }}>
        Décrivez votre situation juridique
      </h2>
      <p style={{ fontSize: 18, color: 'var(--text-muted)', marginBottom: 32, maxWidth: 420, lineHeight: 1.5, fontFeatureSettings: '"cv01","ss03"' }}>
        AvocAI analyse vos risques, cite les lois applicables et vous guide vers la bonne action.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
        {suggestions.map(s => (
          <button key={s} onClick={() => onSuggestion(s)} style={{
            padding: '7px 16px', borderRadius: 9999,
            border: '1px solid var(--border-default)',
            background: 'var(--btn-bg)', color: 'var(--text-body)',
            cursor: 'pointer', fontSize: 13, fontWeight: 510,
            fontFeatureSettings: '"cv01","ss03"',
            transition: 'border-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#5e6ad2'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-default)'}
          >{s}</button>
        ))}
      </div>
    </div>
  );
};

const ChatInterface = ({ setPage }) => {
  const [messages, setMessages] = React.useState([]);
  const [input, setInput] = React.useState('');
  const [typing, setTyping] = React.useState(false);
  const [activeConv, setActiveConv] = React.useState(1);
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const bottomRef = React.useRef(null);

  const handleSend = (text) => {
    const msg = text || input;
    if (!msg.trim()) return;
    setInput('');
    const newMessages = [...messages, { role: 'user', text: msg }];
    setMessages(newMessages);
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, DEMO_MESSAGES[1]]);
    }, 1800);
  };

  React.useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.parentElement.scrollTop = bottomRef.current.offsetTop;
    }
  }, [messages, typing]);

  // If activeConv === 1 and no messages yet, load demo
  React.useEffect(() => {
    if (activeConv === 1 && messages.length === 0) {
      setMessages(DEMO_MESSAGES);
    }
  }, [activeConv]);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <aside style={{
          width: 260, flexShrink: 0,
          background: 'var(--bg-panel)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* New analysis button */}
          <div style={{ padding: 12 }}>
            <button onClick={() => { setActiveConv(null); setMessages([]); }} style={{
              width: '100%', padding: '8px 16px',
              background: '#5e6ad2', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 14, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
              onMouseEnter={e => e.currentTarget.style.background = '#828fff'}
              onMouseLeave={e => e.currentTarget.style.background = '#5e6ad2'}
            >
              <span style={{ fontSize: 16 }}>+</span> Nouvelle analyse
            </button>
          </div>

          {/* Conv list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
            <div style={{ fontSize: 11, fontWeight: 510, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 8px 4px', fontFeatureSettings: '"cv01","ss03"' }}>
              Récent
            </div>
            {conversations.map(c => (
              <button key={c.id} onClick={() => { setActiveConv(c.id); if (c.id === 1) setMessages(DEMO_MESSAGES); else setMessages([]); }} style={{
                width: '100%', textAlign: 'left', padding: '9px 10px',
                borderRadius: 6, border: 'none', cursor: 'pointer',
                background: activeConv === c.id ? 'var(--bg-surface)' : 'transparent',
                borderLeft: activeConv === c.id ? '2px solid #5e6ad2' : '2px solid transparent',
                display: 'block', marginBottom: 2,
              }}>
                <div style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-body)', fontFeatureSettings: '"cv01","ss03"', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)', fontFeatureSettings: '"cv01","ss03"', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.preview}
                </div>
              </button>
            ))}
          </div>

          {/* Bottom user area */}
          <div style={{
            padding: '12px 16px', borderTop: '1px solid var(--border-subtle)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#5e6ad2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 510, color: '#fff' }}>J</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 510, color: 'var(--text-primary)', fontFeatureSettings: '"cv01","ss03"' }}>Jean Dupont</div>
              <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontFeatureSettings: '"cv01","ss03"' }}>Plan Gratuit</div>
            </div>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16 }}>⚙</button>
          </div>
        </aside>
      )}

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-page)' }}>
        {/* Chat header */}
        <div style={{
          height: 48, borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(o => !o)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 18, padding: 4,
          }}>☰</button>
          <span style={{ fontSize: 15, fontWeight: 510, color: 'var(--text-primary)', fontFeatureSettings: '"cv01","ss03"' }}>
            {activeConv ? conversations.find(c => c.id === activeConv)?.title || 'Nouvelle analyse' : 'Nouvelle analyse'}
          </span>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 24px 8px' }}>
          {messages.length === 0 ? (
            <EmptyState onSuggestion={handleSend} />
          ) : (
            <div style={{ maxWidth: 780, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  {msg.role === 'user' ? (
                    <div style={{
                      background: '#5e6ad2', color: '#fff',
                      borderRadius: 8, padding: '10px 14px', maxWidth: '70%',
                      fontSize: 15, lineHeight: 1.5, fontFeatureSettings: '"cv01","ss03"',
                    }}>{msg.text}</div>
                  ) : (
                    <AIMessageCard msg={msg} />
                  )}
                </div>
              ))}
              {typing && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 10 }}>
                    <TypingIndicator />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{ flexShrink: 0, padding: '12px 24px 16px', borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-page)' }}>
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Décrivez votre situation..."
                rows={1}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 8, resize: 'none',
                  fontSize: 15, color: 'var(--text-primary)',
                  fontFamily: 'Inter Variable, Inter, sans-serif',
                  fontFeatureSettings: '"cv01","ss03"',
                  outline: 'none', lineHeight: 1.5,
                  maxHeight: 120, overflowY: 'auto',
                }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'; }}
              />
              <button onClick={() => handleSend()} style={{
                width: 40, height: 40, borderRadius: 6, border: 'none',
                background: '#5e6ad2', color: '#fff', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#828fff'}
                onMouseLeave={e => e.currentTarget.style.background = '#5e6ad2'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M2 8H14M14 8L9 3M14 8L9 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-subtle)', textAlign: 'center', marginTop: 8, fontFeatureSettings: '"cv01","ss03"' }}>
              AvocAI ne remplace pas un avocat · Informations basées sur le droit français
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ChatInterface });
