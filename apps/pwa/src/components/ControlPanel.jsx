import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Octokit } from '@octokit/rest';

const CANDIDATE_MODELS = [
  { id: 'openai/gpt-5.4',                  label: 'GPT-5.4' },
  { id: 'openai/gpt-4o',                   label: 'GPT-4o' },
  { id: 'openai/gpt-4.1',                  label: 'GPT-4.1' },
  { id: 'openai/o3-mini',                  label: 'o3-mini' },
  { id: 'anthropic/claude-sonnet-4-6',     label: 'Claude Sonnet 4.6' },
  { id: 'anthropic/claude-haiku-4',        label: 'Claude Haiku 4' },
];

async function probeModel(modelId, token) {
  try {
    const res = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: 'hi' }],
        // both fields for broadest model compatibility (o-series needs max_completion_tokens)
        max_completion_tokens: 1,
        max_tokens: 1,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function ControlPanel({ session, data, workerUrl, onRefresh, onChronicle }) {
  const [gmPaused, setGmPaused] = useState(data?.game?.gm_paused ?? false);
  const [instantDelivery, setInstantDelivery] = useState(data?.game?.instant_delivery ?? false);
  const [model, setModel] = useState(data?.game?.model ?? '');
  const [gmStyle, setGmStyle] = useState(data?.game?.gm_style ?? 'medium');
  const [travelHours, setTravelHours] = useState(data?.game?.default_travel_hours ?? 24);
  const [passphrase, setPassphrase] = useState(() => sessionStorage.getItem('lm_passphrase') ?? '');
  const [pat, setPat] = useState('');
  const [verifiedModels, setVerifiedModels] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState('idle'); // idle | ok | fail
  const [showNotes, setShowNotes] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [showLockPanel, setShowLockPanel] = useState(false);
  const [msg, setMsg] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteLetterBody, setInviteLetterBody] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);

  const game = data?.game;
  const status = data?.gmStatus;
  const characters = data?.characters ?? {};

  async function patchConfig(changes) {
    if (!passphrase) { setMsg('Enter your passphrase first.'); return false; }
    const res = await fetch(`${workerUrl}/game/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, changes: { ...changes, founderId: session.playerId } }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error); return false; }
    setMsg('Saved.'); onRefresh(); return true;
  }

  async function handleVerifyModels() {
    const token = pat.trim();
    if (!token) { setMsg('Enter your fine-grained GitHub PAT before verifying.'); return; }
    setVerifying(true);
    setVerifiedModels([]);
    setVerifyStatus('idle');
    setMsg('Probing models…');

    const results = await Promise.all(
      CANDIDATE_MODELS.map(async m => ({ ...m, ok: await probeModel(m.id, token) }))
    );

    const good = results.filter(r => r.ok);
    setVerifiedModels(good);
    setVerifying(false);

    if (good.length === 0) {
      setVerifyStatus('fail');
      setMsg('No models responded. Make sure this is a fine-grained PAT with models:read permission.');
    } else {
      setVerifyStatus('ok');
      setMsg(`✓ ${good.length} model${good.length !== 1 ? 's' : ''} verified.`);
      const current = good.find(m => m.id === model);
      if (!current) setModel(good[0].id);
    }
  }

  async function dispatchGM(trigger = 'letter_delivery') {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${session.repoOwner}/${session.repoName}/actions/workflows/gm-loop.yml/dispatches`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.githubToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: 'main', inputs: { trigger } }),
        }
      );
      // GitHub returns 204 No Content on success
      return res.ok || res.status === 204;
    } catch (e) {
      console.warn('GM dispatch error:', e.message);
      return false;
    }
  }

  async function triggerGm() {
    const ok = await dispatchGM('letter_delivery');
    setMsg(ok ? 'GM triggered.' : 'Trigger failed — check your GitHub token has workflow permissions.');
  }

  async function triggerChronicle() {
    const ok = await dispatchGM('finalization');
    if (ok) {
      setMsg('Chronicle generation triggered. Refresh in a minute.');
      setTimeout(() => { onRefresh(); onChronicle(); }, 60000);
    } else {
      setMsg('Trigger failed — check your GitHub token has workflow permissions.');
    }
  }

  async function sendInvite() {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    if (!inviteLetterBody.trim()) { setMsg('Write an invite letter first.'); return; }
    setInviteLoading(true);
    setMsg('');
    try {
      const res = await fetch(`${workerUrl}/game/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: session.gameId, passphrase, letterBody: inviteLetterBody.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Invite failed');
      await navigator.clipboard.writeText(d.inviteLink).catch(() => {});
      setMsg(`Invite link copied! Share it with your new player.`);
      setInviteLetterBody('');
      setShowInviteForm(false);
      onRefresh();
    } catch (e) {
      setMsg(e.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function removePlayer(playerId) {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    if (!confirm(`Remove ${playerId}?`)) return;
    const res = await fetch(`${workerUrl}/game/player`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, playerId }),
    });
    const d = await res.json();
    setMsg(d.success ? 'Removed.' : d.error);
    onRefresh();
  }

  async function regenInvite(playerId) {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    const res = await fetch(`${workerUrl}/game/regenerate-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, playerId }),
    });
    const d = await res.json();
    if (d.inviteLink) {
      await navigator.clipboard.writeText(d.inviteLink).catch(() => {});
      setMsg('New invite link copied!');
    } else {
      setMsg(d.error);
    }
  }

  // Canon word count
  const canonWords = (data?.canon ?? '').split(/\s+/).filter(Boolean).length;

  // [DEVELOPING] entries available to promote
  const developingEntries = (data?.canon ?? '')
    .split('\n')
    .filter(l => l.startsWith('### [DEVELOPING]'))
    .map(l => l.replace(/^### \[DEVELOPING\]\s*/, '').trim());

  async function promoteToLocked(entryTitle) {
    if (!passphrase) { setMsg('Enter passphrase first.'); return; }
    try {
      const octokit = new Octokit({ auth: session.githubToken });
      const { repoOwner: owner, repoName: repo } = session;
      const res = await octokit.repos.getContent({ owner, repo, path: 'world/canon.md' });
      const current = atob(res.data.content.replace(/\n/g, ''));
      const escaped = entryTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const updated = current.replace(
        new RegExp(`### \\[DEVELOPING\\] ${escaped}`, 'g'),
        `### [LOCKED] ${entryTitle}`,
      );
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'world/canon.md',
        message: `canon: lock entry "${entryTitle}"`,
        content: btoa(unescape(encodeURIComponent(updated))),
        sha: res.data.sha,
      });
      setMsg(`"${entryTitle}" is now locked.`);
      onRefresh();
    } catch (e) {
      setMsg('Failed to lock entry: ' + e.message);
    }
  }

  async function archiveGame() {
    if (!confirm('Archive this game? The GitHub repository will become read-only. Letters can no longer be sent or processed.')) return;
    try {
      const res = await fetch(
        `https://api.github.com/repos/${session.repoOwner}/${session.repoName}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.githubToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ archived: true }),
        },
      );
      if (res.ok) {
        setMsg('Game archived — the repository is now read-only.');
      } else {
        const d = await res.json();
        setMsg('Archive failed: ' + (d.message ?? 'unknown error'));
      }
    } catch (e) {
      setMsg('Archive failed: ' + e.message);
    }
  }

   async function deleteRepository() {
     if (!passphrase) { setMsg('Enter your passphrase first.'); return; }

     const confirmed = confirm(
       `⚠️ PERMANENTLY DELETE REPOSITORY?\n\n` +
       `"${session.repoName}" will be completely removed from GitHub.\n` +
       `This cannot be undone!\n\n` +
       `Click OK to confirm deletion.`
     );
     if (!confirmed) return;

     const doubleConfirmed = confirm(
       `🚨 Final confirmation:\n\n` +
       `Delete "${session.repoName}" permanently?\n\n` +
       `All game data, files, and history will be lost.`
     );
     if (!doubleConfirmed) return;

     try {
       const res = await fetch(`${workerUrl}/game/repo`, {
         method: 'DELETE',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ gameId: session.gameId, passphrase }),
       });
       if (res.ok) {
         setMsg('Repository deleted successfully.');
       } else {
         const d = await res.json().catch(() => ({}));
         let errMsg = d.error ?? 'unknown error';
         if (res.status === 403) {
           errMsg = 'Permission denied — the stored GitHub token needs the "Administration: Read and write" permission (fine-grained PAT) or "delete_repo" scope (classic PAT).';
         }
         setMsg('Delete failed: ' + errMsg);
       }
     } catch (e) {
       setMsg('Delete failed: ' + e.message);
     }
   }

  return (
    <div>
      {/* Passphrase unlock */}
      <div className="control-section">
        <div className="control-title">Passphrase</div>
        <input
          type="password"
          value={passphrase}
          onChange={e => { setPassphrase(e.target.value); sessionStorage.setItem('lm_passphrase', e.target.value); }}
          placeholder="Enter passphrase to make changes"
        />
        {msg && <div style={{ fontSize: 13, marginTop: 8, color: 'var(--accent)' }}>{msg}</div>}
      </div>

      {/* GitHub & AI */}
      <div className="control-section">
        <div className="control-title">GitHub · AI</div>
        <p style={{ fontSize: 12, color: 'var(--faded)', marginBottom: 12, lineHeight: 1.6 }}>
          Paste a <strong>fine-grained</strong> GitHub PAT with <code>models:read</code> and repo
          <code> contents</code> permissions. Your models will be verified before you can select one.
        </p>
        <div className="field" style={{ marginBottom: 10 }}>
          <label>Fine-grained GitHub PAT</label>
          <input
            type="password"
            value={pat}
            onChange={e => { setPat(e.target.value); setVerifiedModels([]); setVerifyStatus('idle'); }}
            placeholder="github_pat_…"
            autoComplete="off"
          />
        </div>
        <button
          className="btn-ghost"
          style={{ marginBottom: 12, width: '100%' }}
          onClick={handleVerifyModels}
          disabled={verifying || !pat.trim()}
        >
          {verifying ? 'Verifying…' : 'Verify Models'}
        </button>

        <div className="control-row">
          <label>Model</label>
          <select
            value={model}
            disabled={verifiedModels.length === 0}
            onChange={e => {
              setModel(e.target.value);
              patchConfig({ gameChanges: { model: e.target.value } });
            }}
            style={{ width: 'auto', opacity: verifiedModels.length === 0 ? 0.4 : 1 }}
          >
            {verifiedModels.length === 0
              ? <option value="">— verify PAT first —</option>
              : verifiedModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)
            }
          </select>
        </div>

        {verifyStatus === 'ok' && (
          <button
            className="btn-ghost"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => patchConfig({ gameChanges: { model } })}
            disabled={!passphrase || !model}
          >
            Save Model →
          </button>
        )}
      </div>

      {/* World management */}
      <div className="control-section">
        <div className="control-title">World Management</div>

        <div className="control-row">
          <label>GM Style</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['gentle', 'medium', 'dramatic'].map(s => (
              <button
                key={s}
                className="btn-ghost"
                style={gmStyle === s ? { background: 'var(--ink)', color: 'white', border: 'none' } : {}}
                onClick={async () => { const ok = await patchConfig({ gameChanges: { gm_style: s } }); if (ok) setGmStyle(s); }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="control-row">
          <label>GM Paused</label>
          <button
            className={`toggle${gmPaused ? ' on' : ''}`}
            onClick={async () => { const next = !gmPaused; const ok = await patchConfig({ gameChanges: { gm_paused: next } }); if (ok) setGmPaused(next); }}
          />
        </div>

        <div className="control-row">
          <label>⚡ Instant Delivery <span style={{ fontSize: 11, color: 'var(--faded)' }}>(dev)</span></label>
          <button
            className={`toggle${instantDelivery ? ' on' : ''}`}
            onClick={async () => { const next = !instantDelivery; const ok = await patchConfig({ gameChanges: { instant_delivery: next } }); if (ok) setInstantDelivery(next); }}
          />
        </div>

        <div className="control-row">
          <label>Default Travel Time</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              max={720}
              value={travelHours}
              onChange={e => setTravelHours(Number(e.target.value))}
              style={{ width: 64 }}
            />
            <span style={{ fontSize: 12, color: 'var(--faded)' }}>hours</span>
            <button
              className="btn-ghost"
              style={{ fontSize: 12, padding: '4px 8px' }}
              onClick={() => patchConfig({ gameChanges: { default_travel_hours: travelHours } })}
              disabled={!passphrase}
            >
              Save
            </button>
          </div>
        </div>

        <button className="control-btn" onClick={triggerGm}>Trigger GM Now</button>
        <button className="control-btn" onClick={() => setShowNotes(!showNotes)}>
          {showNotes ? 'Hide GM Notes' : 'View GM Notes'}
        </button>
        {showNotes && (
          <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--faded)', fontStyle: 'italic' }}>
            <ReactMarkdown>{data?.gmNotes || '*No notes yet.*'}</ReactMarkdown>
          </div>
        )}
        <button className="control-btn" onClick={() => setShowFacts(!showFacts)}>
          {showFacts ? 'Hide Canon Facts' : 'View Canon Facts'}
        </button>
        {showFacts && (
          <div style={{ padding: '12px 0', fontSize: 13, color: 'var(--faded)' }}>
            <ReactMarkdown>{data?.facts || '*No facts extracted yet.*'}</ReactMarkdown>
          </div>
        )}

        {developingEntries.length > 0 && (
          <>
            <button className="control-btn" onClick={() => setShowLockPanel(!showLockPanel)}>
              {showLockPanel ? 'Hide Canon Lock' : `Lock Canon Entries (${developingEntries.length})`}
            </button>
            {showLockPanel && (
              <div style={{ padding: '8px 0' }}>
                <p style={{ fontSize: 12, color: 'var(--faded)', marginBottom: 8, lineHeight: 1.5 }}>
                  Promote a <code>[DEVELOPING]</code> entry to <code>[LOCKED]</code> — the GM will treat it as immutable canon.
                </p>
                {developingEntries.map(title => (
                  <div key={title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 13 }}>{title}</span>
                    <button
                      className="btn-ghost"
                      style={{ fontSize: 12, padding: '4px 8px' }}
                      disabled={!passphrase}
                      onClick={() => promoteToLocked(title)}
                    >
                      Lock
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <button className="control-btn" onClick={triggerChronicle}>Generate Chronicle</button>
        {data?.chronicle && (
          <button className="control-btn" onClick={onChronicle}>View Chronicle</button>
        )}

        <button
          className="control-btn"
          style={{ color: '#c0392b', marginTop: 8 }}
          onClick={archiveGame}
          disabled={!session.githubToken}
        >
          Archive Game
        </button>
        <button
          className="control-btn"
          style={{ color: '#c0392b', marginTop: 8 }}
          onClick={deleteRepository}
          disabled={!session.githubToken}
        >
          Delete Repository
        </button>
      </div>

      {/* Players */}
      <div className="control-section">
        <div className="control-title">Players</div>
        {(game?.players ?? []).map(p => (
          <div key={p.id} className="player-row">
            <div>
              <div>{characters[p.id]?.name ?? p.id}{p.id === session.playerId ? ' (you)' : ''}</div>
              <div className="player-status">{p.removed ? 'removed' : p.joined ? 'joined' : 'awaiting'}</div>
            </div>
            {!p.is_founder && !p.removed && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px' }} onClick={() => regenInvite(p.id)}>
                  New Link
                </button>
                <button className="btn-ghost" style={{ fontSize: 12, padding: '4px 8px', color: '#c0392b' }} onClick={() => removePlayer(p.id)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}

        <button className="control-btn" style={{ marginTop: 8 }} onClick={() => setShowInviteForm(v => !v)}>
          {showInviteForm ? 'Cancel' : '+ Invite New Player'}
        </button>
        {showInviteForm && (
          <div style={{ paddingTop: 12 }}>
            <p style={{ fontSize: 12, color: 'var(--faded)', marginBottom: 8, lineHeight: 1.5 }}>
              Write a letter to your new player — it will be waiting for them when they open their invite link.
            </p>
            <textarea
              value={inviteLetterBody}
              onChange={e => setInviteLetterBody(e.target.value)}
              placeholder="The world is changing. Your presence is needed…"
              rows={5}
              style={{ marginBottom: 8 }}
            />
            <button
              className="btn-primary"
              onClick={sendInvite}
              disabled={inviteLoading || !passphrase}
            >
              {inviteLoading ? 'Sending…' : 'Send Invite & Copy Link →'}
            </button>
          </div>
        )}
      </div>

      {/* Game health */}
      <div className="control-section">
        <div className="control-title">Game Health</div>
        <div className="health-stat">
          <span>Last GM run</span>
          <strong>{status?.timestamp ? new Date(status.timestamp).toLocaleString() : 'Never'} {status?.success ? '· ✓' : status?.success === false ? '· ✗' : ''}</strong>
        </div>
        <div className="health-stat">
          <span>Pending</span>
          <strong>{(data?.pendingLetters ?? []).length} letter{(data?.pendingLetters ?? []).length !== 1 ? 's' : ''} in transit</strong>
        </div>
        <div className="health-stat">
          <span>Canon size</span>
          <strong>{canonWords.toLocaleString()} words</strong>
        </div>
        <div className="health-stat">
          <span>Next compress</span>
          <strong>at {(data?.engine?.canon_recent_word_limit ?? 4000).toLocaleString()} words</strong>
        </div>
        <div className="health-stat">
          <span>Repo</span>
          <strong>
            <a
              href={`https://github.com/${session.repoOwner}/${session.repoName}`}
              target="_blank"
              rel="noreferrer"
              style={{ color: 'var(--accent)' }}
            >
              {session.repoName}
            </a>
          </strong>
        </div>
      </div>
    </div>
  );
}
