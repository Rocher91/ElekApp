export default function Tabs({
  setView,
  logout,
  user
}) {
  return (
    <div className="tabs">
      <button onClick={() => setView('engineering_projects')}>
        Projects
      </button>

      <button onClick={() => setView('projects')}>
        BOMs
      </button>

      <button onClick={() => setView('bom_check')}>
        BOM Check
      </button>

      <button onClick={() => setView('reworks')}>
        Reworks
      </button>

      <button onClick={() => setView('pcbs')}>
        PCBs
      </button>

      <button
        onClick={logout}
        style={{ marginLeft: 'auto' }}
      >
        Logout ({user?.username} · {user?.role})
      </button>
    </div>
  );
}