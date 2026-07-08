import Header from '../components/Header';

export default function EngineeringProjects({
    engineeringProjects,
    epName,
    epCode,
    epDescription,

    setEpName,
    setEpCode,
    setEpDescription,

    createEngineeringProject,

    openEngineeringProject,
    deleteEngineeringProject,

    Tabs
}) {

    return (
        <main>

            <Header
                title="Engineering Projects"
            />

            <Tabs />

            <section className="card">

                <h2>Crear Engineering Project</h2>

                <form
                    className="project-form"
                    onSubmit={createEngineeringProject}
                >

                    <input
                        placeholder="Project Name"
                        value={epName}
                        onChange={e => setEpName(e.target.value)}
                    />

                    <input
                        placeholder="Project Code"
                        value={epCode}
                        onChange={e => setEpCode(e.target.value)}
                    />

                    <input
                        placeholder="Description"
                        value={epDescription}
                        onChange={e => setEpDescription(e.target.value)}
                    />

                    <button type="submit">
                        Crear Project
                    </button>

                </form>

            </section>

            <section className="card">

                <h2>Projects</h2>

                {
                    engineeringProjects.length === 0 &&
                    <p>No hay Engineering Projects todavía.</p>
                }

                <div className="projects-list">

                    {
                        engineeringProjects.map(project => (

                            <div
                                key={project.id}
                                className="project-row"
                            >

                                <div>

                                    <strong>
                                        {project.project_name}
                                    </strong>

                                    <p>
                                        {project.project_code}
                                    </p>

                                    <p>
                                        {project.description || '-'}
                                    </p>

                                    <p>

                                        BOMs:
                                        <strong>
                                            {' '}
                                            {project.bom_count || 0}
                                        </strong>

                                        {' · '}

                                        Reworks:
                                        <strong>
                                            {' '}
                                            {project.rework_count || 0}
                                        </strong>

                                    </p>

                                </div>

                                <div className="row-actions">

                                    <button
                                        onClick={() =>
                                            openEngineeringProject(project.id)
                                        }
                                    >
                                        Abrir
                                    </button>

                                    <button
                                        className="danger"
                                        onClick={() =>
                                            deleteEngineeringProject(project.id)
                                        }
                                    >
                                        Borrar
                                    </button>

                                </div>

                            </div>

                        ))
                    }

                </div>

            </section>

        </main>
    );

}