import React from 'react';

const genders = [
  { value: 'male', label: 'Male', emoji: '👨' },
  { value: 'female', label: 'Female', emoji: '👩' },
  { value: 'other', label: 'Other', emoji: '🧑' },
];

export default function Landing({ onGenderSelected }) {
  return (
    <div className="landing">
      <div className="hero">
        <h1>Talk to Strangers</h1>
        <p className="subtitle">
          Meet new people from around the world. Anonymous, free, and fun.
        </p>
      </div>
      <div className="gender-selection">
        <h2>Select your gender to start</h2>
        <p className="hint">Your gender will be verified using your camera for safety.</p>
        <div className="gender-options">
          {genders.map((g) => (
            <button
              key={g.value}
              className="gender-card"
              onClick={() => onGenderSelected(g.value)}
            >
              <span className="gender-emoji">{g.emoji}</span>
              <span className="gender-label">{g.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="features">
        <div className="feature">
          <span className="feature-icon">💬</span>
          <h3>Text Chat</h3>
          <p>Real-time messaging with strangers</p>
        </div>
        <div className="feature">
          <span className="feature-icon">🎯</span>
          <h3>Interest Matching</h3>
          <p>Find people who share your interests</p>
        </div>
        <div className="feature">
          <span className="feature-icon">🛡️</span>
          <h3>Gender Verified</h3>
          <p>Face detection ensures authentic profiles</p>
        </div>
        <div className="feature">
          <span className="feature-icon">🔒</span>
          <h3>Anonymous</h3>
          <p>No registration or personal data needed</p>
        </div>
      </div>
    </div>
  );
}
