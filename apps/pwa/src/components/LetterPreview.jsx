import React, { useState } from 'react';

function EnvelopeSVG({ opening }) {
  return (
    <svg width="120" height="85" viewBox="0 0 140 100" fill="none" style={{ overflow: 'visible' }}>
      {/* Letter lines visible when flap opens */}
      <g style={{
        opacity: opening ? 1 : 0,
        transform: opening ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity 0.45s 0.5s ease-out, transform 0.45s 0.5s ease-out',
      }}>
        <rect x="24" y="26" width="92" height="56" rx="2" fill="#faf7f2" stroke="#e0d8cc" strokeWidth="1"/>
        <line x1="32" y1="40" x2="108" y2="40" stroke="#d4c9b4" strokeWidth="1.5"/>
        <line x1="32" y1="50" x2="108" y2="50" stroke="#d4c9b4" strokeWidth="1.5"/>
        <line x1="32" y1="60" x2="84" y2="60" stroke="#d4c9b4" strokeWidth="1.5"/>
      </g>
      {/* Envelope body */}
      <rect x="4" y="32" width="132" height="64" rx="3" fill="#ede8dd" stroke="#d4c9b4" strokeWidth="1.5"/>
      {/* Bottom V folds */}
      <path d="M4 96 L70 58 L136 96" fill="none" stroke="#d4c9b4" strokeWidth="1.2"/>
      {/* Flap + wax seal (animated) */}
      <g style={{
        transformBox: 'fill-box',
        transformOrigin: 'top center',
        transform: opening ? 'perspective(450px) rotateX(-175deg)' : 'perspective(450px) rotateX(0deg)',
        transition: 'transform 0.7s cubic-bezier(0.4, 0, 0.2, 1)',
      }}>
        <path d="M4 32 L70 70 L136 32 Z" fill="#e3ddd0" stroke="#d4c9b4" strokeWidth="1.5"/>
        <circle cx="70" cy="65" r="13" fill="#7a3b1e"/>
        <text x="70" y="70" textAnchor="middle" fontSize="12" fill="#f5f0e8"
          style={{ fontFamily: "'IM Fell English', serif", fontStyle: 'italic' }}>✦</text>
      </g>
    </svg>
  );
}

export function LetterPreview({ letter, data, onOpen, isSent, isNew }) {
  const [opening, setOpening] = useState(false);

  const handleClick = () => {
    if (opening) return;
    setOpening(true);
    // After animation completes, open the letter
    setTimeout(() => onOpen(letter), 750);
  };

  let displayName;
  if (isSent) {
    displayName = `to ${data?.characters?.[letter.to]?.name ?? letter.to}`;
  } else {
    displayName = `from ${data?.characters?.[letter.from]?.name ?? letter.from}`;
  }

  return (
    <div
      className="letter-preview-container"
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      <div className={`letter-preview-envelope${opening ? ' is-opening' : ''}`}>
        <EnvelopeSVG opening={opening} />
      </div>
      <div className="letter-preview-meta">
        <div className="letter-preview-from">
          {displayName}
          {isNew && <span className="letter-new-badge">NEW</span>}
        </div>
        <div className="letter-preview-label">click to open</div>
      </div>
    </div>
  );
}
