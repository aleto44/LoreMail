/**
 * GitHub API helpers for the Cloudflare Worker.
 */
import sodium from 'tweetsodium';
const GH_API = 'https://api.github.com';
function ghHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'loremail-worker/1.0',
  };
}
export async function createRepo(token, owner, repoName) {
  const res = await fetch(`${GH_API}/user/repos`, {
    method: 'POST',
    headers: ghHeaders(token),
    body: JSON.stringify({
      name: repoName,
      private: true,
      auto_init: false,
      description: 'A Loremail game world',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub createRepo failed: ${res.status} ${err}`);
  }
  return res.json();
}
export async function createFile(token, owner, repo, filePath, content, message) {
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: encoded }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub createFile(${filePath}) failed: ${res.status} ${err}`);
  }
  return res.json();
}
/**
 * Update an existing file in a repo (fetches current SHA first).
 * Falls back to createFile if the file does not exist yet.
 */
export async function updateFile(token, owner, repo, filePath, content, message) {
  const getRes = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    headers: ghHeaders(token),
  });
  if (!getRes.ok) {
    return createFile(token, owner, repo, filePath, content, message);
  }
  const file = await getRes.json();
  const encoded = btoa(unescape(encodeURIComponent(content)));
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/contents/${filePath}`, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ message, content: encoded, sha: file.sha }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub updateFile(${filePath}) failed: ${res.status} ${err}`);
  }
  return res.json();
}
/**
 * Encrypt a secret value for GitHub Actions using the repo public key.
 * Uses tweetsodium (NaCl sealed box — X25519 + XSalsa20-Poly1305).
 * Uses Web APIs (TextEncoder, atob, btoa) — no Buffer/Node.js required.
 */
export async function setSecret(token, owner, repo, secretName, secretValue) {
  const pkRes = await fetch(`${GH_API}/repos/${owner}/${repo}/actions/secrets/public-key`, {
    headers: ghHeaders(token),
  });
  if (!pkRes.ok) throw new Error(`Failed to get public key: ${pkRes.status}`);
  const { key, key_id } = await pkRes.json();
  const messageBytes = new TextEncoder().encode(secretValue);
  const keyBytes = Uint8Array.from(atob(key), c => c.charCodeAt(0));
  const encryptedBytes = sodium.seal(messageBytes, keyBytes);
  const encryptedValue = btoa(String.fromCharCode(...encryptedBytes));
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}/actions/secrets/${secretName}`, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`setSecret failed: ${res.status} ${err}`);
  }
}
export async function dispatchWorkflow(token, owner, repo, workflow, inputs = {}) {
  const res = await fetch(
    `${GH_API}/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ ref: 'main', inputs }),
    },
  );
  if (!res.ok && res.status !== 204) {
    const err = await res.text();
    throw new Error(`dispatchWorkflow failed: ${res.status} ${err}`);
  }
}
export async function getAuthenticatedUser(token) {
  const res = await fetch(`${GH_API}/user`, { headers: ghHeaders(token) });
  if (!res.ok) throw new Error(`Failed to get GitHub user: ${res.status}`);
  return res.json();
}
export async function deleteRepository(token, owner, repo) {
  const res = await fetch(`${GH_API}/repos/${owner}/${repo}`, {
    method: 'DELETE',
    headers: ghHeaders(token),
  });
  if (!res.ok) {
    let errMsg = `GitHub deleteRepository failed: ${res.status}`;
    if (res.status === 403) {
      errMsg += ' (Permission denied — token needs delete_repo scope)';
    }
    const err = await res.text();
    throw new Error(`${errMsg}: ${err}`);
  }
  return res.status === 204;
}
