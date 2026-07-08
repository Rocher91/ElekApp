import Tabs from './components/Tabs';
import Field from './components/Field';
import ProjectRow from './components/ProjectRow';
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { API } from './api/api';
import './style.css';
import EngineeringProjects from './pages/EngineeringProjects';
import EngineeringProjectDetail from './pages/EngineeringProjectDetail';
import BomCheck from './pages/BomCheck';
import ProgressBar from './components/ui/ProgressBar';

import {
    login,
    createAdmin
} from './api/auth';

const STATUSES = [
  { key: 'no_stock', label: 'NoStock' },
  { key: 'wrong_footprint', label: 'Wrong Footprint' },
  { key: 'not_placed', label: 'NotPlaced' },
  { key: 'placed', label: 'Placed' },
];

const REWORK_STATUSES = ['open', 'in_progress', 'waiting_parts', 'done', 'cancelled'];

function App() {

  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem('user') || 'null')
  );

  const [token, setToken] = useState(
    localStorage.getItem('token') || ''
  );

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [testPoints, setTestPoints] = useState([]);
  const [tpDesignator, setTpDesignator] = useState('');
  const [tpSignal, setTpSignal] = useState('');
  const [tpDescription, setTpDescription] = useState('');
  const [tpExpectedValue, setTpExpectedValue] = useState('');
  const [searchRef, setSearchRef] = useState('');
  const [sideFilter, setSideFilter] = useState('ALL');
  const [assemblyReferences, setAssemblyReferences] = useState([]);
  const [bomReferences, setBomReferences] = useState([]);
  const [currentSideProject, setCurrentSideProject] = useState(null);
  const [mountSide, setMountSide] = useState('ALL');
  const [pcbFilter, setPcbFilter] = useState('all');

  const [selectedPcb, setSelectedPcb] = useState(null);
  const [selectedPcbDetail, setSelectedPcbDetail] = useState(null);

  const [pcbs, setPcbs] = useState([]);
  const [pcbProjectId, setPcbProjectId] = useState('');
  const [newPcbName, setNewPcbName] = useState('');
  const [newPcbRevision, setNewPcbRevision] = useState('');
  const [newPcbDescription, setNewPcbDescription] = useState('');

  const [view, setView] = useState('engineering_projects');

  const [engineeringProjects, setEngineeringProjects] = useState([]);
  const [selectedEngineeringProject, setSelectedEngineeringProject] = useState('');
  const [selectedEngineeringProjectDetail, setSelectedEngineeringProjectDetail] = useState(null);

  const [epName, setEpName] = useState('');
  const [epCode, setEpCode] = useState('');
  const [epDescription, setEpDescription] = useState('');

  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [items, setItems] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const [pcbName, setPcbName] = useState('');
  const [pcbCode, setPcbCode] = useState('');
  const [bomFile, setBomFile] = useState(null);
  const [search, setSearch] = useState('');
  const [bomCheckResult, setBomCheckResult] = useState(null);

  const [reworks, setReworks] = useState([]);
  const [rwBoardName, setRwBoardName] = useState('');
  const [rwBoardCode, setRwBoardCode] = useState('');
  const [rwTitle, setRwTitle] = useState('');
  const [rwDescription, setRwDescription] = useState('');
  const [rwComponents, setRwComponents] = useState('');
  const [rwImage, setRwImage] = useState(null);

  const [selectedRework, setSelectedRework] = useState(null);
  const [reworkComments, setReworkComments] = useState([]);
  const [newReworkComment, setNewReworkComment] = useState('');
  const [imageZoom, setImageZoom] = useState(false);

  const filteredAssemblyItems = assemblyReferences;
  const item = filteredAssemblyItems[index];

  useEffect(() => {
    loadEngineeringProjects();
    loadProjects();
    loadReworks();
    loadPcbs();
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (view !== 'assembly') return;
      if (!filteredAssemblyItems.length) return;

      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToIndex(index + 1);
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToIndex(index - 1);
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        quickMark('placed');
      }

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        quickMark('no_stock');
      }

      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        quickMark('wrong_footprint');
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        quickMark('not_placed');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, index, filteredAssemblyItems, currentProject]);

 
  async function login(e) {
    e.preventDefault();

    const fd = new FormData();
    fd.append('username', loginUsername);
    fd.append('password', loginPassword);

    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      body: fd
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error de login');
      return;
    }

    setToken(data.access_token);
    setUser(data.user);

    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));

    setLoginUsername('');
    setLoginPassword('');
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');

    setToken('');
    setUser(null);
    setView('engineering_projects');
  }

  async function loadEngineeringProjects() {
    const res = await fetch(`${API}/api/engineering-projects`);
    const data = await res.json();

    if (res.ok) {
      setEngineeringProjects(data);

      if (data.length > 0 && !selectedEngineeringProject) {
        setSelectedEngineeringProject(String(data[0].id));
      }
    }
  }

  async function exportTestPoints() {
    if (!selectedPcb) return;

    const res = await fetch(
      `${API}/api/pcbs/${selectedPcb}/test-points/export-xlsx`
    );

    if (!res.ok) {
      alert('Error exportando test points');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `pcb_${selectedPcb}_test_points.xlsx`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async function loadProjects() {
    setLoading(true);
    const res = await fetch(`${API}/api/projects`);
    const data = await res.json();

    if (res.ok) {
      setProjects(data);
    }

    setLoading(false);
  }

  async function loadReworks() {
    const res = await fetch(`${API}/api/reworks`);
    const data = await res.json();

    if (res.ok) {
      setReworks(data);
    }
  }

  async function loadTestPoints(pcbId) {
    const res = await fetch(
      `${API}/api/pcbs/${pcbId}/test-points`
    );

    const data = await res.json();

    if (res.ok) {
      setTestPoints(data);
    }
  }

  async function createTestPoint(e) {


    e.preventDefault();

    if (!selectedPcb) return;

    if (!tpDesignator || !tpSignal) {
      alert('Rellena Designator y Signal');
      return;
    }

    const fd = new FormData();

    fd.append('designator', tpDesignator);
    fd.append('signal', tpSignal);
    fd.append('description', tpDescription);
    fd.append('expected_value', tpExpectedValue);

    const res = await fetch(
      `${API}/api/pcbs/${selectedPcb}/test-points`,
      {
        method: 'POST',
        body: fd
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error creando test point');
      return;
    }

    setTpDesignator('');
    setTpSignal('');
    setTpDescription('');
    setTpExpectedValue('');

    await loadTestPoints(selectedPcb);
  }

  async function updateTestPoint(testPointId, patch) {
      if (!selectedPcb) return;

      const current = testPoints.find(tp => tp.id === testPointId);

      if (!current) return;

      const updated = {
        ...current,
        ...patch
      };

      setTestPoints(prev =>
        prev.map(tp =>
          tp.id === testPointId ? updated : tp
        )
      );

      const fd = new FormData();

      fd.append('status', updated.status || 'NOT_TESTED');
      fd.append('measured_value', updated.measured_value || '');
      fd.append('expected_value', updated.expected_value || '');
      fd.append('description', updated.description || '');

      const res = await fetch(
        `${API}/api/pcbs/${selectedPcb}/test-points/${testPointId}`,
        {
          method: 'PATCH',
          body: fd
        }
      );

      const data = await res.json();

      if (!res.ok) {
        alert(data.detail || 'Error actualizando test point');
        await loadTestPoints(selectedPcb);
      }
  }

  async function deleteTestPoint(testPointId) {
    if (!selectedPcb) return;

    const ok = window.confirm(
      '¿Seguro que quieres borrar este test point?'
    );

    if (!ok) return;

    const res = await fetch(
      `${API}/api/pcbs/${selectedPcb}/test-points/${testPointId}`,
      {
        method: 'DELETE'
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error borrando test point');
      return;
    }

    await loadTestPoints(selectedPcb);
  }

  async function loadPcbs() {
    const res = await fetch(`${API}/api/pcbs`);
    const data = await res.json();

    if (res.ok) {
      setPcbs(data);
    }
  }

  async function createEngineeringProject(e) {
    e.preventDefault();

    if (!epName || !epCode) {
      alert('Rellena nombre y código del proyecto');
      return;
    }

    const fd = new FormData();
    fd.append('project_name', epName);
    fd.append('project_code', epCode);
    fd.append('description', epDescription);

    const res = await fetch(`${API}/api/engineering-projects`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error creando proyecto');
      return;
    }

    setEpName('');
    setEpCode('');
    setEpDescription('');

    await loadEngineeringProjects();

    alert('Proyecto creado');
  }

  async function deleteEngineeringProject(projectId) {
    const ok = window.confirm('¿Seguro que quieres borrar este proyecto?');

    if (!ok) return;

    const res = await fetch(`${API}/api/engineering-projects/${projectId}`, {
      method: 'DELETE',
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error borrando proyecto');
      return;
    }

    await loadEngineeringProjects();
    await loadProjects();
    await loadReworks();
    await loadPcbs();
  }

  async function openEngineeringProject(projectId) {
    const res = await fetch(`${API}/api/engineering-projects/${projectId}/dashboard`);
    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error abriendo proyecto');
      return;
    }

    setSelectedEngineeringProjectDetail(data);
    setView('engineering_project_detail');
  }

  async function openSideAssignment(project) {
  const res = await fetch(`${API}/api/projects/${project.id}/references`);
  const data = await res.json();

  if (!res.ok) {
    alert(data.detail || 'Error cargando referencias');
    return;
  }

  setCurrentSideProject(project);
  setBomReferences(data);
  setView('side_assignment');
}

async function updateReferenceSide(referenceId, side) {
    const fd = new FormData();
    fd.append('side', side);

    const res = await fetch(
      `${API}/api/projects/${currentSideProject.id}/references/${referenceId}/side`,
      {
        method: 'PATCH',
        body: fd,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error guardando side');
      return;
    }

    setBomReferences(prev =>
      prev.map(ref =>
        ref.id === referenceId ? { ...ref, side } : ref
      )
    );
  }


  async function createProject(e) {
    e.preventDefault();

    if (!selectedEngineeringProject) {
      alert('Selecciona un Engineering Project');
      return;
    }

    if (!pcbName || !pcbCode || !bomFile) {
      alert('Rellena nombre BOM, código BOM y selecciona una BOM');
      return;
    }

    setLoading(true);

    const fd = new FormData();
    fd.append('engineering_project_id', selectedEngineeringProject);
    fd.append('pcb_name', pcbName);
    fd.append('pcb_code', pcbCode);
    fd.append('file', bomFile);

    const res = await fetch(`${API}/api/projects`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert(data.detail || 'Error creando BOM');
      return;
    }

    setPcbName('');
    setPcbCode('');
    setBomFile(null);

    await loadProjects();
    await openProject(data.project_id);
  }

  async function loadAssemblyReferences(projectId, side = 'ALL') {
    const res = await fetch(
      `${API}/api/projects/${projectId}/assembly-references?side=${side}`
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error cargando referencias de montaje');
      return;
    }

    setAssemblyReferences(data);
    setIndex(0);
  }

  async function openProject(projectId) {
    setLoading(true);

    const res = await fetch(`${API}/api/projects/${projectId}`);
    const data = await res.json();

    setLoading(false);

    if (!res.ok) {
      alert(data.detail || 'Error abriendo BOM');
      return;
    }

    const loadedItems = data.items.map(x => ({
      ...x,
      references: x.reference_designators || x.references || '',
      status: x.status || 'pending',
      comment: x.comment || '',
      side: x.side || 'UNKNOWN',
    }));

    const savedIndex = data.project.current_item || 0;
    const safeIndex = Math.min(Math.max(savedIndex, 0), loadedItems.length - 1);

    setCurrentProject(data.project);
    setItems(loadedItems);
    setMountSide('ALL');
    setIndex(0);
    setView('assembly');

    await loadAssemblyReferences(data.project.id, 'ALL');

  }

  async function deleteProject(projectId) {
    const ok = window.confirm(
      '¿Estás seguro de que quieres borrar esta BOM? Se borrará también todo su estado de montaje.'
    );

    if (!ok) return;

    const res = await fetch(`${API}/api/projects/${projectId}`, {
      method: 'DELETE',
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error borrando BOM');
      return;
    }

    await loadProjects();
  }

  async function checkBom(file) {
    if (!file) return;

    setLoading(true);

    const fd = new FormData();
    fd.append('file', file);

    const res = await fetch(`${API}/api/bom/check`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert(data.detail || 'Error comprobando BOM');
      return;
    }

    setBomCheckResult(data);
  }

  async function createRework(e) {
    e.preventDefault();

    if (!selectedEngineeringProject) {
      alert('Selecciona un Engineering Project');
      return;
    }

    if (!rwBoardName || !rwTitle) {
      alert('Rellena Board Name y Title');
      return;
    }

    const fd = new FormData();
    fd.append('engineering_project_id', selectedEngineeringProject);
    fd.append('board_name', rwBoardName);
    fd.append('board_code', rwBoardCode);
    fd.append('title', rwTitle);
    fd.append('description', rwDescription);
    fd.append('components', rwComponents);

    if (rwImage) {
      fd.append('image', rwImage);
    }

    const res = await fetch(`${API}/api/reworks`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error creando rework');
      return;
    }

    setRwBoardName('');
    setRwBoardCode('');
    setRwTitle('');
    setRwDescription('');
    setRwComponents('');
    setRwImage(null);

    await loadReworks();
    alert('Rework creado');
  }

  async function updateReworkStatus(reworkId, status) {
    const fd = new FormData();
    fd.append('status', status);

    const res = await fetch(`${API}/api/reworks/${reworkId}/status`, {
      method: 'PATCH',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error actualizando rework');
      return;
    }

    await loadReworks();

    if (selectedRework?.id === reworkId) {
      setSelectedRework({
        ...selectedRework,
        status,
      });
    }
  }

  async function deleteRework(reworkId) {
    const ok = window.confirm(
      '¿Estás seguro de que quieres borrar este rework? Esta acción no se puede deshacer.'
    );

    if (!ok) return;

    const res = await fetch(`${API}/api/reworks/${reworkId}`, {
      method: 'DELETE',
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error borrando rework');
      return;
    }

    await loadReworks();

    if (selectedRework?.id === reworkId) {
      setSelectedRework(null);
      setView('reworks');
    }
  }

  async function openReworkDetail(rework) {
    setSelectedRework(rework);
    setImageZoom(false);
    setNewReworkComment('');

    const res = await fetch(`${API}/api/reworks/${rework.id}/comments`);
    const data = await res.json();

    if (res.ok) {
      setReworkComments(data);
    }

    setView('rework_detail');
  }

  async function addReworkComment(e) {
    e.preventDefault();

    if (!selectedRework || !newReworkComment.trim()) return;

    const fd = new FormData();
    fd.append('comment', newReworkComment);
    fd.append('created_by', 'Technician');

    const res = await fetch(`${API}/api/reworks/${selectedRework.id}/comments`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error guardando comentario');
      return;
    }

    setNewReworkComment('');

    const commentsRes = await fetch(`${API}/api/reworks/${selectedRework.id}/comments`);
    const commentsData = await commentsRes.json();

    if (commentsRes.ok) {
      setReworkComments(commentsData);
    }

    await loadReworks();
  }

  async function createPcb(e) {
    e.preventDefault();

    if (!pcbProjectId && !selectedEngineeringProject) {
      alert('Selecciona un Engineering Project');
      return;
    }

    if (!newPcbName) {
      alert('Rellena el nombre de la PCB');
      return;
    }

    const fd = new FormData();
    fd.append('engineering_project_id', pcbProjectId || selectedEngineeringProject);
    fd.append('pcb_name', newPcbName);
    fd.append('pcb_revision', newPcbRevision);
    fd.append('description', newPcbDescription);

    const res = await fetch(`${API}/api/pcbs`, {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error creando PCB');
      return;
    }

    setNewPcbName('');
    setNewPcbRevision('');
    setNewPcbDescription('');

    await loadPcbs();
    alert('PCB creada');
  }

  async function deletePcb(pcbId) {
    const ok = window.confirm('¿Seguro que quieres borrar esta PCB?');

    if (!ok) return;

    const res = await fetch(`${API}/api/pcbs/${pcbId}`, {
      method: 'DELETE',
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error borrando PCB');
      return;
    }

    await loadPcbs();
  }

  async function openPcb(pcbId) {
    const res = await fetch(`${API}/api/pcbs/${pcbId}/detail`);
    const data = await res.json();

    if (res.ok) {
      setSelectedPcb(pcbId);
      setSelectedPcbDetail(data);
      await loadTestPoints(pcbId);
      setView('pcb_detail');
    }
  }

  async function updateChecklistStatus(itemId, status) {
    const fd = new FormData();
    fd.append('status', status);

    await fetch(`${API}/api/pcbs/${selectedPcb}/checklist/${itemId}`, {
      method: 'PATCH',
      body: fd,
    });

    await openPcb(selectedPcb);
  }

  function updateCurrent(patch) {
      if (!item) return;

      setAssemblyReferences(prev =>
        prev.map(ref =>
          ref.id === item.id ? { ...ref, ...patch } : ref
        )
      );
  }

  function goToIndex(newIndex) {
    if (!filteredAssemblyItems.length) return;

    const safeIndex = Math.min(
      Math.max(newIndex, 0),
      filteredAssemblyItems.length - 1
    );

    setIndex(safeIndex);
    saveProjectPosition(safeIndex);
  }

  async function saveCurrentStatus(status) {
    const current = item;
    if (!currentProject || !current) return;

    updateCurrent({ status });

    const fd = new FormData();
    fd.append('status', status);
    fd.append('comment', current.comment || '');

    const res = await fetch(
      `${API}/api/projects/${currentProject.id}/references/${current.id}/status`,
      {
        method: 'PATCH',
        body: fd,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error guardando estado');
    }
  }

  async function quickMark(status) {
    await saveCurrentStatus(status);

    setTimeout(() => {
      goToIndex(index + 1);
    }, 100);
  }

  async function saveCurrentComment(value) {
    const current = item;
    if (!currentProject || !current) return;

    updateCurrent({ comment: value });

    const fd = new FormData();
    fd.append('comment', value);

    fd.append('status', current.status || 'pending');

    await fetch(
      `${API}/api/projects/${currentProject.id}/references/${current.id}/status`,
      {
        method: 'PATCH',
        body: fd,
      }
    );
  }

  async function saveCurrentSide(value) {
    const current = item;
    if (!currentProject || !current) return;

    updateCurrent({ side: value });

    const fd = new FormData();
    fd.append('side', value);

    const res = await fetch(
      `${API}/api/projects/${currentProject.id}/references/${current.id}/side`,
      {
        method: 'PATCH',
        body: fd,
      }
    );

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error guardando side');
    }
  }

  async function saveProjectPosition(newIndex) {
    if (!currentProject) return;

    const fd = new FormData();
    fd.append('current_item', newIndex);

    await fetch(`${API}/api/projects/${currentProject.id}/position`, {
      method: 'PATCH',
      body: fd,
    });
  }

  async function exportResults() {
    if (!currentProject) return;

    const res = await fetch(`${API}/api/projects/${currentProject.id}/export-xls`);

    if (!res.ok) {
      alert('Error generando XLS');
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `BOM_Montaje_${currentProject.pcb_code}.xls`;
    link.click();

    URL.revokeObjectURL(url);
  }

  async function finishProject() {
    const pending = filteredAssemblyItems.filter(i => i.status === 'pending').length;

    if (pending > 0) {
      alert(`No puedes finalizar. Hay ${pending} items pendientes en la vista actual.`);
      return;
    }

    const res = await fetch(`${API}/api/projects/${currentProject.id}/finish`, {
      method: 'POST',
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.detail || 'Error finalizando montaje');
      return;
    }

    await exportResults();
    alert('Montaje finalizado correctamente');

    await loadProjects();
    setView('projects');
  }

  const filteredProjects = projects.filter(project => {
    const text = `${project.project_name || ''} ${project.project_code || ''} ${project.pcb_name || ''} ${project.pcb_code || ''}`.toLowerCase();
    return text.includes(search.toLowerCase());
  });

  const activeProjects = filteredProjects.filter(p => p.status !== 'finished');
  const finishedProjects = filteredProjects.filter(p => p.status === 'finished');

  const filteredPcbs = pcbs.filter(pcb => {
    if (pcbFilter === 'all') return true;
    if (pcbFilter === 'blocked') return pcb.is_blocked;
    if (pcbFilter === 'completed') return pcb.progress === 100;
    if (pcbFilter === 'in_progress') {
      return pcb.progress > 0 && pcb.progress < 100 && !pcb.is_blocked;
    }

    return true;
  });

  if (!token || !user) {
    return (
      <main>
        <header>
          <div>
            <h1>PCB Manager</h1>
            <p>Login</p>
          </div>
        </header>

        <section className="card">
          <h2>Login</h2>

          <form className="project-form" onSubmit={login}>
            <input
              placeholder="Usuario"
              value={loginUsername}
              onChange={e => setLoginUsername(e.target.value)}
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
            />

            <button type="submit">
              Entrar
            </button>
          </form>
        </section>
      </main>
    );
  }

  
  if (view === 'engineering_project_detail' && selectedEngineeringProjectDetail) {
    return (
      <EngineeringProjectDetail
        selectedEngineeringProjectDetail={selectedEngineeringProjectDetail}
        setView={setView}
        openProject={openProject}
        openPcb={openPcb}
        openReworkDetail={openReworkDetail}
        Tabs={() => (
          <Tabs
            setView={setView}
            logout={logout}
            user={user}
          />
        )}
      />
    );
  }

  if (view === 'rework_detail' && selectedRework) {
    return (
      <main>
        <header>
          <div>
            <h1>Rework #{selectedRework.id}</h1>
            <p>
              {selectedRework.board_name}
              {selectedRework.board_code ? ` · ${selectedRework.board_code}` : ''}
            </p>
          </div>

          <button onClick={() => setView('reworks')}>Volver a Reworks</button>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card rework-detail-layout">
          <div>
            <h2>{selectedRework.title}</h2>

            <p><b>Project:</b> {selectedRework.project_name || '-'}</p>
            <p><b>Status:</b> {selectedRework.status}</p>
            <p><b>Components:</b> {selectedRework.components || '-'}</p>

            <p><b>Description:</b></p>
            <p>{selectedRework.description || '-'}</p>

            <p><b>Created:</b> {selectedRework.created_at}</p>
            <p><b>Updated:</b> {selectedRework.updated_at}</p>

            <div className="row-actions">
              <button className="danger" onClick={() => deleteRework(selectedRework.id)}>
                Borrar Rework
              </button>
            </div>
          </div>

          {selectedRework.image_path && (
            <img
              src={`${API}${selectedRework.image_path}`}
              alt="Rework"
              className="rework-detail-image"
              onClick={() => setImageZoom(true)}
            />
          )}
        </section>

        <section className="card">
          <h2>Comentarios del técnico</h2>

          <form onSubmit={addReworkComment} className="comment-form">
            <textarea
              placeholder="Añadir comentario del rework..."
              value={newReworkComment}
              onChange={e => setNewReworkComment(e.target.value)}
            />

            <button type="submit">Añadir comentario</button>
          </form>

          <div className="comments-list">
            {reworkComments.length === 0 && (
              <p>No hay comentarios todavía.</p>
            )}

            {reworkComments.map(c => (
              <div key={c.id} className="comment-card">
                <p>{c.comment}</p>
                <small>
                  {c.created_by || 'Technician'} · {c.created_at}
                </small>
              </div>
            ))}
          </div>
        </section>

        {imageZoom && selectedRework.image_path && (
          <div className="image-modal" onClick={() => setImageZoom(false)}>
            <img src={`${API}${selectedRework.image_path}`} alt="Rework zoom" />
          </div>
        )}
      </main>
    );
  }

  if (view === 'reworks') {
    return (
      <main>
        <header>
          <h1>Reworks</h1>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card">
          <h2>Nuevo Rework</h2>

          <form className="rework-form" onSubmit={createRework}>
            <select
              value={selectedEngineeringProject}
              onChange={e => setSelectedEngineeringProject(e.target.value)}
            >
              {engineeringProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.project_name} ({p.project_code})
                </option>
              ))}
            </select>

            <input
              placeholder="Board Name"
              value={rwBoardName}
              onChange={e => setRwBoardName(e.target.value)}
            />

            <input
              placeholder="Board Code"
              value={rwBoardCode}
              onChange={e => setRwBoardCode(e.target.value)}
            />

            <input
              placeholder="Title"
              value={rwTitle}
              onChange={e => setRwTitle(e.target.value)}
            />

            <textarea
              placeholder="Description"
              value={rwDescription}
              onChange={e => setRwDescription(e.target.value)}
            />

            <input
              placeholder="Components involved: U12, R34, C5..."
              value={rwComponents}
              onChange={e => setRwComponents(e.target.value)}
            />

            <input
              type="file"
              accept="image/*"
              onChange={e => setRwImage(e.target.files?.[0] || null)}
            />

            <button type="submit">Crear Rework</button>
          </form>
        </section>

        <section className="card">
          <h2>Listado de Reworks</h2>

          {reworks.length === 0 && <p>No hay reworks todavía.</p>}

          <div className="rework-list">
            {reworks.map(r => (
              <div
                key={r.id}
                className="rework-card"
                onClick={() => openReworkDetail(r)}
              >
                {r.image_path && (
                  <img
                    src={`${API}${r.image_path}`}
                    alt="Rework"
                    className="rework-image"
                  />
                )}

                <div>
                  <strong>#{r.id} - {r.title}</strong>
                  <p><b>Project:</b> {r.project_name || '-'}</p>

                  <p>
                    <b>Board:</b> {r.board_name}
                    {r.board_code ? ` · ${r.board_code}` : ''}
                  </p>

                  <p><b>Components:</b> {r.components || '-'}</p>
                  <p><b>Description:</b> {r.description || '-'}</p>
                  <p><b>Created:</b> {r.created_at}</p>
                </div>

                <div className="rework-status-box">
                  <label>Status</label>

                  <select
                    value={r.status}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateReworkStatus(r.id, e.target.value)}
                  >
                    {REWORK_STATUSES.map(status => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>

                  <button
                    className="danger"
                    onClick={e => {
                      e.stopPropagation();
                      deleteRework(r.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (view === 'bom_check') {
    return (
      <BomCheck
        loading={loading}
        bomCheckResult={bomCheckResult}
        checkBom={checkBom}
        Tabs={() => (
          <Tabs
            setView={setView}
            logout={logout}
            user={user}
          />
        )}
      />
    );
  }

  if (view === 'pcbs') {
    return (
      <main>
        <header>
          <h1>PCBs</h1>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card">
          <h2>Crear PCB</h2>

          <form className="project-form" onSubmit={createPcb}>
            <select
              value={pcbProjectId || selectedEngineeringProject}
              onChange={e => setPcbProjectId(e.target.value)}
            >
              {engineeringProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.project_name} ({p.project_code})
                </option>
              ))}
            </select>

            <input
              placeholder="PCB Name"
              value={newPcbName}
              onChange={e => setNewPcbName(e.target.value)}
            />

            <input
              placeholder="Revision"
              value={newPcbRevision}
              onChange={e => setNewPcbRevision(e.target.value)}
            />

            <input
              placeholder="Description"
              value={newPcbDescription}
              onChange={e => setNewPcbDescription(e.target.value)}
            />

            <button type="submit">Crear PCB</button>
          </form>
        </section>

        <section className="card">
          <h2>Listado de PCBs</h2>

          <div className="filter-buttons">
            <button onClick={() => setPcbFilter('all')}>All</button>
            <button onClick={() => setPcbFilter('in_progress')}>In Progress</button>
            <button onClick={() => setPcbFilter('blocked')}>Blocked</button>
            <button onClick={() => setPcbFilter('completed')}>Completed</button>
          </div>

          {pcbs.length === 0 && <p>No hay PCBs todavía.</p>}

          <div className="projects-list">
            {filteredPcbs.map(pcb => (
              <div key={pcb.id} className="project-row">
                <div className="pcb-card-content">
                  <div className="pcb-card-header">
                    <div>
                      <strong>{pcb.pcb_name}</strong>

                      <p>
                        {pcb.project_name || '-'} · {pcb.project_code || '-'}
                      </p>

                      <p>
                        Revision: {pcb.pcb_revision || '-'}
                      </p>
                    </div>

                    <div className="pcb-progress-number">
                      {pcb.progress || 0}%
                    </div>
                  </div>

                  <ProgressBar
                      value={pcb.progress || 0}
                      className="pcb-progress-bar"
                  />

                  <p>
                    <b>Current Phase:</b> {pcb.current_phase || '-'}
                  </p>

                  <p>
                    <b>Tasks:</b> {pcb.completed_tasks || 0}/{pcb.total_tasks || 0} completed ·{' '}
                    In Progress: {pcb.in_progress_tasks || 0} ·{' '}
                    Pending: {pcb.pending_tasks || 0}
                  </p>

                  <p>
                    <b>Status:</b>{' '}
                    <span className="status active">
                      {pcb.status}
                    </span>
                  </p>

                  {pcb.description && <p>{pcb.description}</p>}

                  {pcb.is_blocked && (
                    <p className="blocked-label">⚠ BLOCKED</p>
                  )}
                </div>

                <div className="row-actions">
                  <button onClick={() => openPcb(pcb.id)}>
                    Abrir
                  </button>

                  <button
                    className="danger"
                    onClick={() => deletePcb(pcb.id)}
                  >
                    Borrar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (view === 'pcb_detail' && selectedPcbDetail) {
    const p = selectedPcbDetail;
    const phaseEntries = Object.entries(p.phases);

    function taskWeight(status) {
      if (status === 'completed') return 1;
      if (status === 'in_progress') return 0.5;
      return 0;
    }

    function getPhaseProgress(tasks) {
      if (!tasks.length) return 0;

      const score = tasks.reduce(
        (sum, task) => sum + taskWeight(task.status),
        0
      );

      return Math.round((score * 100) / tasks.length);
    }

    function getPhaseStatus(tasks) {
      if (tasks.some(t => t.status === 'blocked')) {
        return 'blocked';
      }

      if (tasks.every(t => t.status === 'completed')) {
        return 'completed';
      }

      if (
        tasks.some(t => t.status === 'in_progress') ||
        tasks.some(t => t.status === 'completed')
      ) {
        return 'in_progress';
      }

      return 'not_started';
    }

    const currentPhase =
      phaseEntries.find(([_, tasks]) =>
        tasks.some(t => t.status === 'in_progress')
      )?.[0] ||
      phaseEntries.find(([_, tasks]) =>
        tasks.some(t => t.status !== 'completed')
      )?.[0] ||
      'Completed';

    const isBlocked = p.checklist.some(
      task => task.status === 'blocked'
    );

    const tpStats = {
      total: testPoints.length,
      pass: testPoints.filter(tp => tp.status === 'PASS').length,
      fail: testPoints.filter(tp => tp.status === 'FAIL').length,
      notTested: testPoints.filter(tp => !tp.status || tp.status === 'NOT_TESTED').length,
      na: testPoints.filter(tp => tp.status === 'NA').length,
    };

    return (
      <main>
        <header>
          <div>
            <h1>{p.pcb.pcb_name}</h1>

            <p>
              {p.pcb.project_name}
              {' · '}
              {p.pcb.project_code}
            </p>

            <p>
              Revision: {p.pcb.pcb_revision || '-'}
            </p>
          </div>

          <button onClick={() => setView('pcbs')}>
            Volver
          </button>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card">
          <h2>Progress {p.stats.progress}%</h2>

          <ProgressBar
              value={p.stats.progress}
          />

          <div className="dashboard-stats">
            <div className="dashboard-card">
              <h3>Current Phase</h3>
              <strong>{currentPhase}</strong>
            </div>

            <div className="dashboard-card">
              <h3>Blocked</h3>
              <strong>{isBlocked ? 'YES' : 'NO'}</strong>
            </div>

            <div className="dashboard-card">
              <h3>Total</h3>
              <strong>{p.stats.total}</strong>
            </div>

            <div className="dashboard-card">
              <h3>Completed</h3>
              <strong>{p.stats.completed}</strong>
            </div>

            <div className="dashboard-card">
              <h3>In Progress</h3>
              <strong>{p.stats.in_progress}</strong>
            </div>

            <div className="dashboard-card">
              <h3>Pending</h3>
              <strong>
                {
                  p.stats.total -
                  p.stats.completed -
                  p.stats.in_progress
                }
              </strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Test Points</h2>
          
          <button onClick={exportTestPoints}>
            Export Test Points Excel
          </button>
          <form
            className="project-form"
            onSubmit={createTestPoint}
          >
            <input
              placeholder="Designator (TP1)"
              value={tpDesignator}
              onChange={e => setTpDesignator(e.target.value)}
            />

            <input
              placeholder="Signal (VDD_3V3)"
              value={tpSignal}
              onChange={e => setTpSignal(e.target.value)}
            />

            <input
              placeholder="Expected Value (3.3V)"
              value={tpExpectedValue}
              onChange={e => setTpExpectedValue(e.target.value)}
            />

            <input
              placeholder="Description"
              value={tpDescription}
              onChange={e => setTpDescription(e.target.value)}
            />

            <button type="submit">
              Add Test Point
            </button>
          </form>

          <div className="dashboard-stats">
            <div className="dashboard-card">
              <h3>Total TP</h3>
              <strong>{tpStats.total}</strong>
            </div>

            <div className="dashboard-card">
              <h3>PASS</h3>
              <strong>{tpStats.pass}</strong>
            </div>

            <div className="dashboard-card">
              <h3>FAIL</h3>
              <strong>{tpStats.fail}</strong>
            </div>

            <div className="dashboard-card">
              <h3>NOT TESTED</h3>
              <strong>{tpStats.notTested}</strong>
            </div>

            <div className="dashboard-card">
              <h3>N/A</h3>
              <strong>{tpStats.na}</strong>
            </div>
          </div>

          {testPoints.length === 0 && (
            <p>No hay test points todavía.</p>
          )}

          <table className="side-table">
            <thead>
              <tr>
                <th>Designator</th>
                <th>Signal</th>
                <th>Expected</th>
                <th>Measured</th>
                <th>Status</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {testPoints.map(tp => (
                <tr key={tp.id}>
                  <td>{tp.designator}</td>
                  <td>{tp.signal}</td>

                  <td>
                    <input
                      value={tp.expected_value || ''}
                      onChange={e =>
                        updateTestPoint(
                          tp.id,
                          { expected_value: e.target.value }
                        )
                      }
                    />
                  </td>

                  <td>
                    <input
                      value={tp.measured_value || ''}
                      onChange={e =>
                        updateTestPoint(
                          tp.id,
                          { measured_value: e.target.value }
                        )
                      }
                    />
                  </td>

                  <td>
                    <select
                      value={tp.status || 'NOT_TESTED'}
                      onChange={e =>
                        updateTestPoint(
                          tp.id,
                          { status: e.target.value }
                        )
                      }
                    >
                      <option value="NOT_TESTED">NOT_TESTED</option>
                      <option value="PASS">PASS</option>
                      <option value="FAIL">FAIL</option>
                      <option value="NA">N/A</option>
                    </select>
                  </td>

                  <td>
                    <input
                      value={tp.description || ''}
                      onChange={e =>
                        updateTestPoint(
                          tp.id,
                          { description: e.target.value }
                        )
                      }
                    />
                  </td>

                  <td>
                    <button
                      className="danger"
                      onClick={() => deleteTestPoint(tp.id)}
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>PCB Timeline</h2>

          <div className="pcb-timeline">
            {Object.entries(p.phases).map(([phase, tasks], idx) => {
              const phaseProgress = getPhaseProgress(tasks);
              const phaseStatus = getPhaseStatus(tasks);
              const isCurrent = phase === currentPhase;

              return (
                <div key={phase} className="timeline-step">
                  <div className={`timeline-dot ${phaseStatus}`}>
                    {idx + 1}
                  </div>

                  <div className={`timeline-content ${isCurrent ? 'current-phase' : ''}`}>
                    <strong>{phase}</strong>
                    <span>{phaseProgress}%</span>

                    <ProgressBar
                        value={phaseProgress}
                    />
                                      </div>
                </div>
              );
            })}
          </div>
        </section>

        {Object.entries(p.phases).map(([phase, tasks]) => (
          <section key={phase} className="card">
            <h2>{phase}</h2>

            <div className="pcb-checklist">
              {tasks.map(task => (
                <div key={task.id} className="pcb-check-item">
                  <div>
                    {task.status === 'completed' && '✔ '}
                    {task.status === 'in_progress' && '◐ '}
                    {task.status === 'blocked' && '⚠ '}
                    {task.status === 'not_started' && '○ '}
                    {task.task_name}
                  </div>

                  <select
                    value={task.status}
                    onChange={e =>
                      updateChecklistStatus(task.id, e.target.value)
                    }
                  >
                    <option value="not_started">Not Started</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    );
  }

  if (view === 'projects') {
    return (
      <main>
        <header>
          <h1>PCB Engineering Manager</h1>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card">
          <h2>Crear nueva BOM</h2>

          <form className="project-form" onSubmit={createProject}>
            <select
              value={selectedEngineeringProject}
              onChange={e => setSelectedEngineeringProject(e.target.value)}
            >
              {engineeringProjects.length === 0 && (
                <option value="">No hay Engineering Projects</option>
              )}

              {engineeringProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.project_name} ({p.project_code})
                </option>
              ))}
            </select>

            <input
              placeholder="Nombre BOM"
              value={pcbName}
              onChange={e => setPcbName(e.target.value)}
            />

            <input
              placeholder="Código BOM"
              value={pcbCode}
              onChange={e => setPcbCode(e.target.value)}
            />

            <input
              type="file"
              accept=".xls,.xlsx,.csv"
              onChange={e => setBomFile(e.target.files?.[0] || null)}
            />

            <button type="submit">Crear BOM</button>
          </form>
        </section>

        <section className="card">
          <h2>BOMs</h2>

          <input
            className="search"
            placeholder="Buscar por proyecto, código, nombre BOM..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />

          {loading && <p>Cargando...</p>}

          <h3>BOMs activas</h3>

          <div className="projects-list">
            {activeProjects.length === 0 && !loading && (
              <p>No hay BOMs activas.</p>
            )}

            {activeProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                openProject={openProject}
                deleteProject={deleteProject}
                openSideAssignment={openSideAssignment}
              />
            ))}
          </div>

          <h3>BOMs finalizadas</h3>

          <div className="projects-list">
            {finishedProjects.length === 0 && !loading && (
              <p>No hay BOMs finalizadas.</p>
            )}

            {finishedProjects.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                openProject={openProject}
                deleteProject={deleteProject}
                openSideAssignment={openSideAssignment}
              />
            ))}
          </div>
        </section>
      </main>
    );
  }

  if (view === 'side_assignment' && currentSideProject) {
    const counts = {
      TOP: bomReferences.filter(r => r.side === 'TOP').length,
      BOTTOM: bomReferences.filter(r => r.side === 'BOTTOM').length,
      THROUGH_HOLE: bomReferences.filter(r => r.side === 'THROUGH_HOLE').length,
      DNI: bomReferences.filter(r => r.side === 'DNI').length,
      UNKNOWN: bomReferences.filter(r => !r.side || r.side === 'UNKNOWN').length,
    };

    const assigned =
      counts.TOP +
      counts.BOTTOM +
      counts.THROUGH_HOLE +
      counts.DNI;

    const coverage =
      bomReferences.length > 0
        ? Math.round((assigned * 100) / bomReferences.length)
        : 0;

    const refs = (
      sideFilter === 'ALL'
        ? bomReferences
        : sideFilter === 'UNKNOWN'
          ? bomReferences.filter(r => !r.side || r.side === 'UNKNOWN')
          : bomReferences.filter(r => r.side === sideFilter)
    ).filter(r =>
      (r.reference_designator || '')
        .toLowerCase()
        .includes(searchRef.toLowerCase())
    );

    return (
      <main>
        <header>
          <div>
            <h1>Side Assignment</h1>
            <p>{currentSideProject.pcb_name} · {currentSideProject.pcb_code}</p>
          </div>

          <button onClick={() => setView('projects')}>
            Volver
          </button>
        </header>

        <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

        <section className="card">
          <h2>Reference Designators</h2>

          <p>Total references: {bomReferences.length}</p>

          <p>
            Coverage: <strong>{coverage}%</strong>
          </p>

          <input
            className="search"
            placeholder="Buscar referencia..."
            value={searchRef}
            onChange={e => setSearchRef(e.target.value)}
          />

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}
          >
            <span>TOP: {counts.TOP}</span>
            <span>BOTTOM: {counts.BOTTOM}</span>
            <span>TH: {counts.THROUGH_HOLE}</span>
            <span>DNI: {counts.DNI}</span>
            <span>UNKNOWN: {counts.UNKNOWN}</span>
          </div>

          <div
            style={{
              display: 'flex',
              gap: '10px',
              marginBottom: '20px',
              flexWrap: 'wrap'
            }}
          >

            <button onClick={() => setSideFilter('ALL')}>
              ALL ({bomReferences.length})
            </button>

            <button onClick={() => setSideFilter('TOP')}>
              TOP ({counts.TOP})
            </button>

            <button onClick={() => setSideFilter('BOTTOM')}>
              BOTTOM ({counts.BOTTOM})
            </button>

            <button onClick={() => setSideFilter('THROUGH_HOLE')}>
              TH ({counts.THROUGH_HOLE})
            </button>

            <button onClick={() => setSideFilter('UNKNOWN')}>
              UNKNOWN ({counts.UNKNOWN})
            </button>

            <button onClick={() => setSideFilter('DNI')}>
              DNI ({counts.DNI})
            </button>

          </div>
          <table className="side-table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Value</th>
                <th>Footprint</th>
                <th>MPN</th>
                <th>Side</th>
              </tr>
            </thead>

            <tbody>
              {refs.map(ref => (
                <tr key={ref.id}>
                  <td>{ref.reference_designator}</td>
                  <td>{ref.value || '-'}</td>
                  <td>{ref.footprint || '-'}</td>
                  <td>{ref.manufacturer_part_number || '-'}</td>
                  <td>
                    <select
                      value={ref.side || 'UNKNOWN'}
                      onChange={e =>
                        updateReferenceSide(ref.id, e.target.value)
                      }
                    >
                      <option value="UNKNOWN">UNKNOWN</option>
                      <option value="TOP">TOP</option>
                      <option value="BOTTOM">BOTTOM</option>
                      <option value="THROUGH_HOLE">THROUGH_HOLE</option>
                      <option value="DNI">DNI</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    );
  }

  if (view === 'engineering_projects') {

    return (

        <EngineeringProjects

            engineeringProjects={engineeringProjects}

            epName={epName}
            epCode={epCode}
            epDescription={epDescription}

            setEpName={setEpName}
            setEpCode={setEpCode}
            setEpDescription={setEpDescription}

            createEngineeringProject={createEngineeringProject}

            openEngineeringProject={openEngineeringProject}

            deleteEngineeringProject={deleteEngineeringProject}

            Tabs={() => (
                <Tabs
                    setView={setView}
                    logout={logout}
                    user={user}
                />
            )}

        />

    );

}

  const markedCount = filteredAssemblyItems.filter(i => i.status !== 'pending').length;
  const pendingCount = filteredAssemblyItems.filter(i => i.status === 'pending').length;
  const noStockCount = filteredAssemblyItems.filter(i => i.status === 'no_stock').length;
  const progress =
    filteredAssemblyItems.length > 0
      ? Math.round((markedCount * 100) / filteredAssemblyItems.length)
      : 0;


  return (
    <main>
      <header>
        <div>
          <h1>BOM Assembly Checker</h1>
          <p>
            Proyecto: <strong>{currentProject?.project_name || '-'}</strong>
            {' · '}
            BOM: <strong>{currentProject?.pcb_name}</strong>
            {' · '}
            Código: <strong>{currentProject?.pcb_code}</strong>
          </p>
        </div>

        <button onClick={() => setView('projects')}>Volver a BOMs</button>
      </header>

      <Tabs
              setView={setView}
              logout={logout}
              user={user}
        />

      <section className="card">
        <h2>Mount Side</h2>

        <div className="filter-buttons">
          {['ALL', 'TOP', 'BOTTOM', 'THROUGH_HOLE'].map(side => (
            <button
              key={side}
              onClick={async () => {
                setMountSide(side);
                setIndex(0);

                if (currentProject) {
                  await loadAssemblyReferences(currentProject.id, side);
                }
              }}
            >
              {side}
            </button>
          ))}
        </div>
      </section>

      {filteredAssemblyItems.length === 0 && (
        <section className="card">
          <h2>No hay componentes para montar en esta cara</h2>
          <p>Selecciona otra cara o asigna TOP/BOTTOM/THROUGH_HOLE a los componentes.</p>
        </section>
      )}

      {item && (
        <div className="assembly-layout">
          <section className="card">
            <div className="topbar">
              <b>Item</b>
              <span>{index + 1}</span>

              <b>of</b>
              <span>{filteredAssemblyItems.length}</span>

              <b>Mount</b>
              <span>{item.status}</span>

              <b>Quantity</b>
              <span>1</span>

              <button onClick={() => goToIndex(index - 1)}>PREV</button>
              <button onClick={() => goToIndex(index + 1)}>NEXT</button>
            </div>

            <div className="reference">
              <b>Reference Designators</b>
              <div>{item.reference_designator}</div>
            </div>

            <div className="grid">
              <Field label="Description" value={item.description} />
              <Field label="Footprint" value={item.footprint} />
              <Field label="Value" value={item.value} />
              <Field label="Package" value={item.package} />
              <Field label="Manufacturer" value={item.manufacturer} />
              <Field label="Manufacturer Part Number" value={item.manufacturer_part_number} />
              <Field label="Supplier" value={item.supplier} />
              <Field label="Supplier Part Number" value={item.supplier_part_number} />
              <Field label="MPS PN" value={item.mps_pn} />
              <Field label="DIGIKEY" value={item.digikey} />
              <Field label="MOUSER" value={item.mouser} />
              <Field label="FARNELL" value={item.farnell} />

              <label>Side</label>
              <select
                value={item.side || 'UNKNOWN'}
                onChange={e => saveCurrentSide(e.target.value)}
              >
                <option value="UNKNOWN">UNKNOWN</option>
                <option value="TOP">TOP</option>
                <option value="BOTTOM">BOTTOM</option>
                <option value="THROUGH_HOLE">THROUGH_HOLE</option>
                <option value="DNI">DNI</option>
              </select>
            </div>

            <textarea
              placeholder="Comentarios del técnico..."
              value={item.comment}
              onChange={e => saveCurrentComment(e.target.value)}
            />

            <div className="actions">
              {STATUSES.map(s => (
                <button
                  key={s.key}
                  className={s.key}
                  onClick={() => saveCurrentStatus(s.key)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <aside className="summary-panel">
            <div className="summary-card">
              <h3>Resumen del BOM</h3>

              <div className="summary-row">
                <span>Cara</span>
                <span className="summary-blue">{mountSide}</span>
              </div>

              <div className="summary-row">
                <span>Total ítems</span>
                <span className="summary-blue">{filteredAssemblyItems.length}</span>
              </div>

              <div className="summary-row">
                <span>Marcados</span>
                <span className="summary-green">{markedCount}</span>
              </div>

              <div className="summary-row">
                <span>Pendientes</span>
                <span className="summary-orange">{pendingCount}</span>
              </div>

              <div className="summary-row">
                <span>No Stock</span>
                <span className="summary-red">{noStockCount}</span>
              </div>
            </div>

            <div className="summary-card">
              <h3>Progreso</h3>

              <div className="progress-large">
                <div className="progress-bar">
                  <div style={{ width: `${progress}%` }} />
                </div>

                <strong>{progress}%</strong>
              </div>

              <p>{markedCount} de {filteredAssemblyItems.length} ítems marcados</p>
            </div>

            <div className="summary-card shortcut-card">
              <h3>Atajos</h3>

              <div className="shortcut"><span className="key">ENTER</span><span>Placed</span></div>
              <div className="shortcut"><span className="key">P</span><span>No Stock</span></div>
              <div className="shortcut"><span className="key">W</span><span>Wrong Footprint</span></div>
              <div className="shortcut"><span className="key">N</span><span>Not Placed</span></div>
              <div className="shortcut"><span className="key">←</span><span className="key">→</span><span>Navegar</span></div>
            </div>

            {index === filteredAssemblyItems.length - 1 && (
              <button className="finish" onClick={finishProject}>
                FINALIZAR MONTAJE
              </button>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}



createRoot(document.getElementById('root')).render(<App />);