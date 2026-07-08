import { API } from './api';

export async function login(username, password) {
  const form = new FormData();

  form.append('username', username);
  form.append('password', password);

  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json();

  return { res, data };
}

export async function createAdmin(username, password) {
  const form = new FormData();

  form.append('username', username);
  form.append('password', password);

  const res = await fetch(`${API}/api/auth/create-admin`, {
    method: 'POST',
    body: form,
  });

  const data = await res.json();

  return { res, data };
}