export const API = 'http://localhost:8001';

export async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  const data = await res.json();
  return { res, data };
}

export async function apiPostForm(path, formData) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  return { res, data };
}

export async function apiPatchForm(path, formData) {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    body: formData,
  });

  const data = await res.json();
  return { res, data };
}

export async function apiDelete(path) {
  const res = await fetch(`${API}${path}`, {
    method: 'DELETE',
  });

  const data = await res.json();
  return { res, data };
}