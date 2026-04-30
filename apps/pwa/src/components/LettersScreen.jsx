import React from 'react';

export function LettersScreen({ session, data, loading, onReadLetter }) {
  if (loading && !data) {
    return <div className="loading">Loading letters…</div>;
  }

  const delivered = data?.deliveredLetters ?? [];
  const pending = data?.pendingLetters ?? [];

  const inbox = delivered.filter(l => l.to === session.playerId);
  const sent = delivered.filter(l => l.from === session.playerId);
  const inTransit = pending.filter(l => l.from === session.playerId);

  const isEmpty = inbox.length === 0 && inTransit.length === 0 && sent.length === 0;

  return (
    <div>
      {isEmpty && (
        <div className="empty-state">
          <div style={{ fontSize: 28, marginBottom: 12 }}>〄</div>
          No letters yet.<br />
          <span style={{ fontSize: 13 }}>Compose one to begin.</span>
        </div>
      )}

      {inbox.length > 0 && (
        <>
          {inbox.map(letter => (
            <div
              key={letter.id}
              className="letter-row"
              onClick={() => onReadLetter(letter)}
            >
              <div className="letter-dot" />
              <div className="letter-row-meta">
                <div className="letter-row-from">{formatSenderName(letter.from, data)}</div>
                <div className="letter-row-preview">{letter.body.split('\n')[0]?.slice(0, 60)}…</div>
                <div className="letter-row-time">{letter.arrivedLabel}</div>
              </div>
            </div>
          ))}
        </>
      )}

      {inTransit.length > 0 && (
        <>
          <div className="section-title">In Transit</div>
          {inTransit.map(letter => (
            <div key={letter.id} className="in-transit-row">
              → to {formatRecipientName(letter.to, data)}<br />
              <span style={{ fontSize: 12 }}>
                arrives in ~{letter.hoursRemaining > 0 ? `${letter.hoursRemaining} hours` : 'shortly'}
              </span>
            </div>
          ))}
        </>
      )}

      {sent.length > 0 && (
        <>
          <div className="section-title">Sent</div>
          {sent.map(letter => (
            <div
              key={letter.id}
              className="letter-row letter-row--sent"
              onClick={() => onReadLetter(letter)}
            >
              <div className="letter-row-meta">
                <div className="letter-row-from">→ {formatRecipientName(letter.to, data)}</div>
                <div className="letter-row-preview">{letter.body.split('\n')[0]?.slice(0, 60)}…</div>
                <div className="letter-row-time">{letter.arrivedLabel}</div>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function formatSenderName(id, data) {
  return data?.characters?.[id]?.name ?? id;
}

function formatRecipientName(id, data) {
  return data?.characters?.[id]?.name ?? '-unknown-';
}
