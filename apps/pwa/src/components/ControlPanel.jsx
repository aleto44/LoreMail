import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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
  const [model, setModel] = useState(data?.game?.model ?? '');
  const [gmStyle, setGmStyle] = useState(data?.game?.gm_style ?? 'medium');
  const [passphrase, setPassphrase] = useState('');
  const [pat, setPat] = useState('');
  const [verifiedModels, setVerifiedModels] = useState([]);
  const [verifying, setVerifying] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState('idle'); // idle | ok | fail
  const [showNotes, setShowNotes] = useState(false);
  const [showFacts, setShowFacts] = useState(false);
  const [msg, setMsg] = useState('');

  const game = data?.game;
  const status = data?.gmStatus;
  const characters = data?.characters ?? {};

  async function patchConfig(changes) {
    if (!passphrase) { setMsg('Enter your passphrase first.'); return; }
    const res = await fetch(`${workerUrl}/game/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gameId: session.gameId, passphrase, changes: { ...changes, founderId: session.playerId } }),
    });
    const d = await res.json();
    if (!res.ok) { setMsg(d.error); return; }
    setMsg('Saved.'); onRefresh();
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

  return (
    <div>
      {/* Passphrase unlock */}
      <div className="control-section">
        <div className="control-title">Passphrase</div>
        <input
          type="password"
          value={passphrase}
          onChange={e => setPassphrase(e.target.value)}
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
                onClick={() => { setGmStyle(s); patchConfig({ gameChanges: { gm_style: s } }); }}
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
            onClick={() => { setGmPaused(!gmPaused); patchConfig({ gameChanges: { gm_paused: !gmPaused } }); }}
          />
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
        <button className="control-btn" onClick={triggerChronicle}>Generate Chronicle</button>
        {data?.chronicle && (
          <button className="control-btn" onClick={onChronicle}>View Chronicle</button>
        )}
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
          <strong>at {(data?.game?.engine?.canon_recent_word_limit ?? 4000).toLocaleString()} words</strong>
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
