import React from 'react';

export default function Header({ onHome, inChat }) {
  return (
    <header className="header">
      <div className="header-content">
        <button className="logo" onClick={inChat ? onHome : undefined}>
          ChatConnect
        </button>
        <nav className="header-nav">
          <a href="#" onClick={(e) => { e.preventDefault(); onHome(); }}>
            Home
          </a>
        </nav>
      </div>
    </header>
  );
}
