
// AvocAI — Shared components & design tokens

const RiskMeter = ({ level }) => {
  const getColor = (l) => l <= 2 ? '#27a644' : l === 3 ? '#f59e0b' : '#ef4444';
  const getLabel = (l) => l <= 2 ? 'Faible' : l === 3 ? 'Modéré' : l === 4 ? 'Élevé' : 'Critique';
  const color = getColor(level);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {[1, 2, 3, 4, 5].map((i) =>
      <div key={i} style={{
        width: 10, height: 10, borderRadius: '50%',
        background: i <= level ? color : 'var(--border-default)',
        border: i <= level ? 'none' : '1px solid var(--border-default)',
        flexShrink: 0
      }} />
      )}
      <span style={{ fontSize: 13, fontWeight: 510, color, fontFeatureSettings: '"cv01","ss03"' }}>
        {getLabel(level)}
      </span>
    </div>);

};

const LawBlock = ({ code, title, excerpt, link }) =>
<div style={{
  background: 'var(--bg-panel)',
  border: '1px solid var(--border-default)',
  borderLeft: '2px solid #5e6ad2',
  borderRadius: 6,
  padding: '12px 16px',
  fontFamily: '"Berkeley Mono", ui-monospace, "SF Mono", Menlo, monospace'
}}>
    <div style={{ fontSize: 13, fontWeight: 590, color: 'var(--text-primary)', fontFeatureSettings: '"cv01","ss03"', marginBottom: 4 }}>
      {code} — {title}
    </div>
    <div style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6, marginBottom: 8 }}>
      {excerpt}
    </div>
    <a href="#" onClick={(e) => e.preventDefault()} style={{ fontSize: 13, fontWeight: 510, color: '#7170ff', textDecoration: 'none' }}>
      Lire l'article complet →
    </a>
  </div>;


const PremiumBlock = ({ title, body, cta }) =>
<div style={{
  background: 'var(--bg-surface-elevated)',
  borderLeft: '3px solid #5e6ad2',
  borderRadius: '0 6px 6px 0',
  padding: 16
}}>
    <div style={{ fontSize: 11, fontWeight: 510, color: '#7170ff', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, fontFeatureSettings: '"cv01","ss03"' }}>
      ✦ Démarche disponible
    </div>
    <div style={{ fontSize: 15, fontWeight: 590, color: 'var(--text-primary)', marginBottom: 4, fontFeatureSettings: '"cv01","ss03"' }}>
      {title}
    </div>
    <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 12, fontFeatureSettings: '"cv01","ss03"' }}>
      {body}
    </div>
    <button style={{
    width: '100%', padding: '8px 16px', background: '#5e6ad2',
    color: '#fff', border: 'none', borderRadius: 6, fontSize: 14,
    fontWeight: 510, cursor: 'pointer', fontFeatureSettings: '"cv01","ss03"'
  }}
  onMouseEnter={(e) => e.target.style.background = '#828fff'}
  onMouseLeave={(e) => e.target.style.background = '#5e6ad2'}>
    
      {cta}
    </button>
  </div>;


const Navbar = ({ page, setPage, theme, toggleTheme }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      height: 56, background: 'var(--bg-panel)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center',
      padding: '0 24px', gap: 0
    }}>
      {/* Logo */}
      <div onClick={() => setPage('landing')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <rect width="28" height="28" rx="6" fill="#5e6ad2" />
          <path d="M7 20L14 8L21 20H17.5L14 13.5L10.5 20H7Z" fill="white" fillOpacity="0.95" />
          <circle cx="14" cy="20" r="1.5" fill="#7170ff" />
        </svg>
        <span style={{ fontSize: 16, fontWeight: 590, color: 'var(--text-primary)', fontFeatureSettings: '"cv01","ss03"', letterSpacing: '-0.2px' }}>AvocAI</span>
      </div>

      {/* Center nav */}
      <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 32, alignItems: 'center' }}>
        {['Fonctionnalités', 'Tarifs', 'FAQ'].map((item) =>
        <a key={item} href="#" onClick={(e) => e.preventDefault()} style={{
          fontSize: 13, fontWeight: 510, color: 'var(--text-body)',
          textDecoration: 'none', fontFeatureSettings: '"cv01","ss03"'
        }}
        onMouseEnter={(e) => e.target.style.color = 'var(--text-primary)'}
        onMouseLeave={(e) => e.target.style.color = 'var(--text-body)'}>
          {item}</a>
        )}
      </div>

      {/* Right buttons — pushed to far right */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 'auto' }}>
        {page === 'landing' ?
        <>
            <button onClick={() => setPage('chat')} style={{
            padding: '6px 14px', borderRadius: 6, border: '1px solid var(--btn-border)',
            background: 'var(--btn-bg)', cursor: 'pointer',
            fontSize: 14, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"', color: "rgb(208, 214, 224)"
          }}>Se connecter</button>
            <button onClick={() => setPage('chat')} style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            color: '#fff', cursor: 'pointer',
            fontWeight: 510, fontFeatureSettings: '"cv01","ss03"', textAlign: "right", fontSize: "15px", letterSpacing: "0px", width: "174px", lineHeight: "0.75", background: "rgb(94, 106, 210)", height: "30px"
          }}
          onMouseEnter={(e) => e.target.style.background = '#828fff'}
          onMouseLeave={(e) => e.target.style.background = '#5e6ad2'}>
            Essayer gratuitement</button>
          </> :

        <button onClick={() => setPage('landing')} style={{
          padding: '6px 14px', borderRadius: 6, border: '1px solid var(--btn-border)',
          background: 'var(--btn-bg)', color: 'var(--text-body)', cursor: 'pointer',
          fontSize: 14, fontWeight: 510, fontFeatureSettings: '"cv01","ss03"'
        }}>Retour au site</button>
        }
      </div>

      {/* Fixed theme toggle — bottom right */}
      <button onClick={toggleTheme} style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 200,
        width: 40, height: 40, borderRadius: 9999,
        border: '1px solid var(--btn-border)',
        background: 'var(--bg-panel)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)'
      }}>
        {theme === 'light' ?
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ stroke: "rgb(100, 100, 100)" }}>
            <circle cx="8" cy="8" r="3" /><line x1="8" y1="1" x2="8" y2="3" /><line x1="8" y1="13" x2="8" y2="15" />
            <line x1="1" y1="8" x2="3" y2="8" /><line x1="13" y1="8" x2="15" y2="8" />
            <line x1="3" y1="3" x2="4.5" y2="4.5" /><line x1="11.5" y1="11.5" x2="13" y2="13" />
            <line x1="13" y1="3" x2="11.5" y2="4.5" /><line x1="4.5" y1="11.5" x2="3" y2="13" />
          </svg> :

        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M13 9.5A5.5 5.5 0 016.5 3 5.5 5.5 0 1013 9.5z" />
          </svg>
        }
      </button>
    </nav>);

};

Object.assign(window, { RiskMeter, LawBlock, PremiumBlock, Navbar });