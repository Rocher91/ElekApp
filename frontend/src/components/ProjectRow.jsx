export default function ProjectRow({
  project,
  openProject,
  deleteProject,
  openSideAssignment
}) {
  const progress =
    project.total_items > 0
      ? Math.round(((project.marked_items || 0) / project.total_items) * 100)
      : 0;

  return (
    <div className="project-row">
      <div>
        <strong>{project.pcb_name}</strong>

        <p>
          Proyecto: {project.project_name || 'Sin proyecto'} · Código proyecto:{' '}
          {project.project_code || '-'}
        </p>

        <p>
          Código BOM: {project.pcb_code} · Items: {project.total_items || 0} ·
          Marcados: {project.marked_items || 0}
        </p>

        <p>
          Estado:{' '}
          <span className={`status ${project.status}`}>
            {project.status}
          </span>
        </p>

        <p>Progreso: {progress}%</p>

        <div className="progress-bar">
          <div style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="row-actions">
        <button onClick={() => openProject(project.id)}>
          Abrir
        </button>

        <button onClick={() => openSideAssignment(project)}>
          Side Assignment
        </button>

        <button
          className="danger"
          onClick={() => deleteProject(project.id)}
        >
          Borrar
        </button>
      </div>
    </div>
  );
}