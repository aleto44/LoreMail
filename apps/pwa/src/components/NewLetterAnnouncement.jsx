import React from 'react';

function LargeEnvelopeSVG() {
  return (
    <svg width="220" height="157" viewBox="0 0 140 100" fill="none" style={{ overflow: 'visible' }}>
      {/* Letter peek */}
      <rect x="24" y="20" width="92" height="56" rx="2" fill="#faf7f2" stroke="#e0d8cc" strokeWidth="1"/>
      <line x1="32" y1="34" x2="108" y2="34" stroke="#d4c9b4" strokeWidth="1.5"/>
      <line x1="32" y1="44" x2="108" y2="44" stroke="#d4c9b4" strokeWidth="1.5"/>
      <line x1="32" y1="54" x2="84" y2="54" stroke="#d4c9b4" strokeWidth="1.5"/>
      {/* Envelope body */}
      <rect x="4" y="32" width="132" height="64" rx="3" fill="#ede8dd" stroke="#d4c9b4" strokeWidth="1.5"/>
      {/* Bottom V folds */}
      <path d="M4 96 L70 58 L136 96" fill="none" stroke="#d4c9b4" strokeWidth="1.2"/>
      {/* Flap */}
      <path d="M4 32 L70 70 L136 32 Z" fill="#e3ddd0" stroke="#d4c9b4" strokeWidth="1.5"/>
      {/* Wax seal */}
      <circle cx="70" cy="64" r="14" fill="#7a3b1e" stroke="#5c2c14" strokeWidth="1"/>
      <text x="70" y="70" textAnchor="middle" fontSize="14" fill="#f5f0e8"
        style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic' }}>✦</text>
    </svg>
  );
}

export function NewLetterAnnouncement({ newLetters, data, onOpen, onDismiss }) {
  const count = newLetters.length;

  const senderNames = [...new Set(
    newLetters.map(l => data?.characters?.[l.from]?.name ?? l.from)
  )];

  const fromText = count === 1
    ? `from ${senderNames[0]}`
    : senderNames.length === 1
      ? `${count} letters from ${senderNames[0]}`
      : senderNames.length === 2
        ? `from ${senderNames[0]} & ${senderNames[1]}`
        : `${count} letters from ${senderNames.length} correspondents`;

  const titleText = count === 1 ? 'A Letter Has Arrived' : `${count} Letters Have Arrived`;

  return (
    <div
      className="letter-announcement-overlay"
      onClick={e => { if (e.target === e.currentTarget) onDismiss(); }}
    >
      <div className="letter-announcement-card">
        <div
          className="letter-announcement-envelope-wrap"
          onClick={onOpen}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onOpen()}
          aria-label="Open letters"
        >
          <LargeEnvelopeSVG />
        </div>

        <div className="letter-announcement-eyebrow">Correspondence</div>
        <div className="letter-announcement-title">{titleText}</div>
        <div className="letter-announcement-from">{fromText}</div>
        <div className="letter-announcement-divider" />

        <button className="letter-announcement-open" onClick={onOpen}>
          <span className="letter-announcement-open-icon">✉</span>
          Open Letters
        </button>

        <button className="letter-announcement-later" onClick={onDismiss}>
          Read later
        </button>
      </div>
    </div>
  );
}
