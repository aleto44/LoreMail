import React, { useState } from 'react';
import { Octokit } from '@octokit/rest';

export function ComposeScreen({ session, data, workerUrl, onSent, onCancel }) {
  const [to, setTo] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const game = data?.game;
  const travelHours = game?.default_travel_hours ?? 24;

  const recipients = (game?.players ?? [])
    .filter(p => p.joined && !p.removed && p.id !== session.playerId);

  async function handleSend() {
    if (!to || !body.trim()) { setError('Select a recipient and write your letter.'); return; }
    setSending(true);
    setError('');

    try {
      const octokit = new Octokit({ auth: session.githubToken });
      const { repoOwner: owner, repoName: repo } = session;

      // Build letter file
      const sentAt = Math.floor(Date.now() / 1000);
      const deliverAt = sentAt + travelHours * 3600;
      const uuid = crypto.randomUUID().replace(/-/g, '');
      const filename = `${deliverAt}_${session.playerId}_${to}_${uuid}.md`;
      const frontmatter = `---\nfrom: ${session.playerId}\nto: ${to}\nsent_at: ${sentAt}\ndeliver_at: ${deliverAt}\ndelivered: false\n---\n`;
      const content = frontmatter + body;

      // Commit to pending
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: `letters/pending/${filename}`,
        message: `letter: ${session.playerId} → ${to}`,
        content: btoa(unescape(encodeURIComponent(content))),
      });

      // Trigger GM (fire and forget, don't block on passphrase requirement)
      // Note: trigger endpoint requires passphrase — user may not have it stored
      // We trigger via the worker if passphrase is available in session

      onSent();
    } catch (e) {
      console.error(e);
      setError(e.message ?? 'Failed to send');
      setSending(false);
    }
  }

  const selectedRecipient = recipients.find(p => p.id === to);

  return (
    <div className="app-shell">
      <div className="compose-header">
        <button className="btn-ghost compose-header-cancel" onClick={onCancel}>← cancel</button>
        <button
          className="compose-header-send"
          onClick={handleSend}
          disabled={sending}
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          {sending ? 'sending…' : 'send →'}
        </button>
      </div>
      <div className="compose-body screen-content">
        <div className="field">
          <label>To</label>
          <select value={to} onChange={e => setTo(e.target.value)}>
            <option value="">Select a recipient…</option>
            {recipients.map(p => (
              <option key={p.id} value={p.id}>{p.character ?? p.id}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Your letter…"
            rows={12}
            style={{ fontFamily: "'IM Fell English', serif", fontSize: 16 }}
          />
        </div>
        <div className="compose-eta">
          will arrive in approximately {travelHours} hours
        </div>
        {error && <div className="error-msg">{error}</div>}
      </div>
    </div>
  );
}
