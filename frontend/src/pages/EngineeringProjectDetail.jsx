import Header from '../components/Header';
import ProgressBar from '../components/ui/ProgressBar';

export default function EngineeringProjectDetail({
  selectedEngineeringProjectDetail,
  setView,
  openProject,
  openPcb,
  openReworkDetail,
  Tabs
}) {
  const p = selectedEngineeringProjectDetail;

  return (
    <main>
    
    <Header
            title={p.project.project_name}
            subtitle={p.project.project_code}
        >

        <button
            onClick={() => setView('engineering_projects')}
        >
            Volver
        </button>

    </Header>

      <Tabs />

      <section className="card">
        <h2>Project PCB Progress</h2>

        <h1>{p.stats.overall_pcb_progress || 0}%</h1>

        <ProgressBar
            value={p.stats.overall_pcb_progress}
            className="pcb-progress-bar"
        />

        <p>
          PCBs: <strong>{p.stats.pcb_count || 0}</strong>
          {' · '}
          Blocked PCBs: <strong>{p.stats.blocked_pcbs || 0}</strong>
        </p>

        {p.stats.most_advanced_pcb && (
          <p>
            Most advanced PCB:{' '}
            <strong>{p.stats.most_advanced_pcb.pcb_name}</strong>{' '}
            ({p.stats.most_advanced_pcb.progress}%)
          </p>
        )}

        {p.stats.least_advanced_pcb && (
          <p>
            Least advanced PCB:{' '}
            <strong>{p.stats.least_advanced_pcb.pcb_name}</strong>{' '}
            ({p.stats.least_advanced_pcb.progress}%)
          </p>
        )}
      </section>

      <section className="dashboard-stats">
        <div className="dashboard-card">
          <h3>BOMs</h3>
          <strong>{p.stats.bom_count}</strong>
        </div>

        <div className="dashboard-card">
          <h3>Reworks</h3>
          <strong>{p.stats.rework_count}</strong>
        </div>

        <div className="dashboard-card">
          <h3>Open</h3>
          <strong>{p.stats.open_reworks}</strong>
        </div>

        <div className="dashboard-card">
          <h3>Closed</h3>
          <strong>{p.stats.closed_reworks}</strong>
        </div>
      </section>

      <section className="card">
        <h2>BOMs</h2>

        {p.boms.length === 0 && <p>Este proyecto no tiene BOMs.</p>}

        <div className="projects-list">
          {p.boms.map(bom => {
            const progress =
              bom.total_items > 0
                ? Math.round(((bom.marked_items || 0) / bom.total_items) * 100)
                : 0;

            return (
              <div key={bom.id} className="project-row">
                <div>
                  <strong>{bom.pcb_name}</strong>
                  <p>{bom.pcb_code}</p>

                  <p>
                    {bom.marked_items || 0}/{bom.total_items || 0} items
                  </p>

                  <ProgressBar
                        value={progress}
                  />

                  <p>{progress}%</p>
                </div>

                <div className="row-actions">
                  <button onClick={() => openProject(bom.id)}>
                    Abrir BOM
                  </button>

                  <button onClick={() => setView('projects')}>
                    Ver todas
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h2>PCBs</h2>

        {p.pcbs.length === 0 && <p>Este proyecto no tiene PCBs.</p>}

        <div className="projects-list">
          {p.pcbs.map(pcb => (
            <div key={pcb.id} className="project-row">
              <div className="pcb-card-content">
                <div className="pcb-card-header">
                  <div>
                    <strong>{pcb.pcb_name}</strong>
                    <p>Revision: {pcb.pcb_revision || '-'}</p>
                    <p>{pcb.description || '-'}</p>
                  </div>

                  <div className="pcb-progress-number">
                    {pcb.progress || 0}%
                  </div>
                </div>

                <ProgressBar
                    value={pcb.progress}
                    className="pcb-progress-bar"
                />

                <p>
                  <b>Current Phase:</b> {pcb.current_phase || '-'}
                </p>

                <p>
                  <b>Tasks:</b> {pcb.completed_tasks || 0}/
                  {pcb.total_tasks || 0} completed · In Progress:{' '}
                  {pcb.in_progress_tasks || 0} · Pending:{' '}
                  {pcb.pending_tasks || 0}
                </p>

                <p>
                  <b>Status:</b> {pcb.status}
                </p>

                {pcb.is_blocked && (
                  <p className="blocked-label">⚠ BLOCKED</p>
                )}
              </div>

              <div className="row-actions">
                <button onClick={() => openPcb(pcb.id)}>
                  Abrir PCB
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Últimos Reworks</h2>

        {p.reworks.length === 0 && <p>Este proyecto no tiene reworks.</p>}

        <div className="projects-list">
          {p.reworks.map(r => (
            <div key={r.id} className="project-row">
              <div>
                <strong>{r.title}</strong>
                <p>
                  {r.board_name} {r.board_code ? `· ${r.board_code}` : ''}
                </p>
                <p>Estado: {r.status}</p>
              </div>

              <button onClick={() => openReworkDetail(r)}>
                Abrir Rework
              </button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}