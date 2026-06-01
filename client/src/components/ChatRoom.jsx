import React, { useState, useRef, useEffect } from 'react';

export default function ChatRoom({
  chatState,
  onSendMessage,
  onTyping,
  onStopTyping,
  onNext,
  onReport,
}) {
  const [input, setInput] = useState('');
  const [showReportConfirm, setShowReportConfirm] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const { partner, messages, isPartnerTyping } = chatState;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [partner]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput('');
    onStopTyping();
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    onTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onStopTyping();
    }, 1000);
  };

  return (
    <div className="chat-room">
      <div className="chat-header">
        <div className="partner-info">
          <span className="partner-avatar">
            {partner?.gender === 'male' ? '👨' : partner?.gender === 'female' ? '👩' : '🧑'}
          </span>
          <div>
            <span className="partner-name">Stranger</span>
            {partner?.interests?.length > 0 && (
              <div className="partner-interests">
                {partner.interests.map((i, idx) => (
                  <span key={idx} className="interest-tag">{i}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="chat-actions">
          <button className="btn-icon" onClick={onNext} title="Next">
            ⏭️
          </button>
          <button
            className="btn-icon btn-report"
            onClick={() => setShowReportConfirm(true)}
            title="Report"
          >
            🚩
          </button>
        </div>
      </div>

      <div className="messages-container">
        {partner?.disconnected && (
          <div className="disconnected-banner">
            <p>Partner disconnected ({partner.disconnectReason === 'partner_skipped' ? 'skipped' : 'left'})</p>
            <button className="btn-primary btn-small" onClick={onNext}>
              Find New Partner
            </button>
          </div>
        )}

        <div className="messages-list">
          {messages.length === 0 && !partner?.disconnected && (
            <div className="chat-placeholder">
              <p>You are now connected with a stranger. Say hello!</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`message ${msg.senderId === 'self' ? 'message-self' : 'message-other'}`}
            >
              <div className="message-bubble">
                <p>{msg.text}</p>
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {isPartnerTyping && (
            <div className="typing-indicator">
              <span>Stranger is typing</span>
              <span className="typing-dots"><span>.</span><span>.</span><span>.</span></span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {!partner?.disconnected && (
        <form className="chat-input" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Type a message..."
            maxLength={1000}
            autoFocus
          />
          <button type="submit" disabled={!input.trim()} className="btn-send">
            Send
          </button>
        </form>
      )}

      {showReportConfirm && (
        <div className="modal-overlay" onClick={() => setShowReportConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Report User</h3>
            <p>Are you sure you want to report this user? The chat will end immediately.</p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setShowReportConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={() => {
                  onReport();
                  setShowReportConfirm(false);
                }}
              >
                Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
