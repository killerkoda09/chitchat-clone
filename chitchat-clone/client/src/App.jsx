import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Header from './components/Header';
import Landing from './components/Landing';
import FaceVerification from './components/FaceVerification';
import ChatRoom from './components/ChatRoom';
import './App.css';

const SOCKET_URL = 'http://localhost:3001';

export default function App() {
  const [step, setStep] = useState('landing');
  const [socket, setSocket] = useState(null);
  const [userId, setUserId] = useState(null);
  const [userSettings, setUserSettings] = useState({
    gender: '',
    genderPreference: 'any',
    interests: [],
    verifiedGender: null,
  });
  const [chatState, setChatState] = useState({
    chatId: null,
    partner: null,
    messages: [],
    isPartnerTyping: false,
    isWaiting: false,
  });

  const chatStateRef = useRef(chatState);
  chatStateRef.current = chatState;

  useEffect(() => {
    const newSocket = io(SOCKET_URL);
    setSocket(newSocket);

    newSocket.on('connected', ({ userId: id }) => {
      setUserId(id);
    });

    newSocket.on('match-found', ({ chatId, partner }) => {
      setChatState((prev) => ({
        ...prev,
        chatId,
        partner,
        messages: [],
        isWaiting: false,
      }));
      setStep('chat');
    });

    newSocket.on('waiting', () => {
      setChatState((prev) => ({ ...prev, isWaiting: true }));
    });

    newSocket.on('search-cancelled', () => {
      setChatState((prev) => ({ ...prev, isWaiting: false }));
    });

    newSocket.on('receive-message', (message) => {
      setChatState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
      }));
    });

    newSocket.on('partner-typing', () => {
      setChatState((prev) => ({ ...prev, isPartnerTyping: true }));
    });

    newSocket.on('partner-stop-typing', () => {
      setChatState((prev) => ({ ...prev, isPartnerTyping: false }));
    });

    newSocket.on('partner-disconnected', ({ reason }) => {
      setChatState((prev) => ({
        ...prev,
        partner: { ...prev.partner, disconnected: true, disconnectReason: reason },
      }));
    });

    newSocket.on('chat-ended', () => {
      setChatState({
        chatId: null,
        partner: null,
        messages: [],
        isPartnerTyping: false,
        isWaiting: false,
      });
    });

    newSocket.on('reported', () => {
      setStep('landing');
      setChatState({
        chatId: null,
        partner: null,
        messages: [],
        isPartnerTyping: false,
        isWaiting: false,
      });
      alert('You have been reported. The chat has ended.');
    });

    return () => {
      newSocket.close();
    };
  }, []);

  const handleGenderSelected = useCallback((gender) => {
    setUserSettings((prev) => ({ ...prev, gender }));
    setStep('verify');
  }, []);

  const handleVerificationComplete = useCallback((verifiedGender) => {
    setUserSettings((prev) => ({ ...prev, verifiedGender }));
    setStep('setup');
  }, []);

  const handleVerificationFailed = useCallback(() => {
    setStep('landing');
    alert('Gender verification failed. Please try again.');
  }, []);

  const handleStartChatting = useCallback((settings) => {
    setUserSettings((prev) => ({ ...prev, ...settings }));
    setStep('searching');
    socket.emit('find-match', {
      gender: settings.gender,
      genderPreference: settings.genderPreference,
      interests: settings.interests,
      verifiedGender: settings.verifiedGender || userSettings.verifiedGender,
    });
  }, [socket, userSettings.verifiedGender]);

  const handleSendMessage = useCallback((text) => {
    if (!socket || !chatStateRef.current.chatId) return;
    socket.emit('send-message', { text });
    const message = {
      id: Date.now().toString(),
      senderId: userId,
      text,
      timestamp: Date.now(),
    };
    setChatState((prev) => ({
      ...prev,
      messages: [...prev.messages, message],
    }));
  }, [socket, userId]);

  const handleTyping = useCallback(() => {
    if (!socket) return;
    socket.emit('typing');
  }, [socket]);

  const handleStopTyping = useCallback(() => {
    if (!socket) return;
    socket.emit('stop-typing');
  }, [socket]);

  const handleNext = useCallback(() => {
    if (!socket) return;
    socket.emit('next');
    setChatState((prev) => ({
      ...prev,
      partner: { ...prev.partner, disconnected: true },
    }));
    setTimeout(() => {
      socket.emit('find-match', {
        gender: userSettings.gender,
        genderPreference: userSettings.genderPreference,
        interests: userSettings.interests,
        verifiedGender: userSettings.verifiedGender,
      });
      setChatState((prev) => ({
        ...prev,
        chatId: null,
        partner: null,
        messages: [],
        isWaiting: true,
      }));
      setStep('searching');
    }, 500);
  }, [socket, userSettings]);

  const handleReport = useCallback(() => {
    if (!socket) return;
    socket.emit('report');
    setStep('landing');
    setChatState({
      chatId: null,
      partner: null,
      messages: [],
      isPartnerTyping: false,
      isWaiting: false,
    });
  }, [socket]);

  const handleBackToHome = useCallback(() => {
    if (socket && chatState.chatId) {
      socket.emit('next');
    }
    setStep('landing');
    setChatState({
      chatId: null,
      partner: null,
      messages: [],
      isPartnerTyping: false,
      isWaiting: false,
    });
  }, [socket, chatState.chatId]);

  return (
    <div className="app">
      <Header onHome={handleBackToHome} inChat={step === 'chat'} />
      <main className="main-content">
        {step === 'landing' && <Landing onGenderSelected={handleGenderSelected} />}
        {step === 'verify' && (
          <FaceVerification
            selectedGender={userSettings.gender}
            onVerified={handleVerificationComplete}
            onFailed={handleVerificationFailed}
          />
        )}
        {step === 'setup' && (
          <SetupPanel
            userSettings={userSettings}
            onStart={handleStartChatting}
            onBack={() => setStep('landing')}
          />
        )}
        {step === 'searching' && (
          <SearchingPanel
            onCancel={() => {
              socket?.emit('cancel-search');
              setStep('landing');
            }}
          />
        )}
        {step === 'chat' && (
          <ChatRoom
            chatState={chatState}
            onSendMessage={handleSendMessage}
            onTyping={handleTyping}
            onStopTyping={handleStopTyping}
            onNext={handleNext}
            onReport={handleReport}
          />
        )}
      </main>
    </div>
  );
}

function SetupPanel({ userSettings, onStart, onBack }) {
  const [interests, setInterests] = useState('');
  const [genderPreference, setGenderPreference] = useState('any');

  const handleSubmit = (e) => {
    e.preventDefault();
    const interestList = interests
      .split(',')
      .map((i) => i.trim().toLowerCase())
      .filter(Boolean);
    onStart({
      gender: userSettings.gender,
      genderPreference,
      interests: interestList,
      verifiedGender: userSettings.verifiedGender,
    });
  };

  return (
    <div className="setup-panel">
      <div className="setup-card">
        <h2>Almost there!</h2>
        <p className="verified-badge">Gender verified as: {userSettings.verifiedGender}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Who do you want to chat with?</label>
            <select
              value={genderPreference}
              onChange={(e) => setGenderPreference(e.target.value)}
            >
              <option value="any">Everyone</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="form-group">
            <label>Interests (comma separated, optional)</label>
            <input
              type="text"
              value={interests}
              onChange={(e) => setInterests(e.target.value)}
              placeholder="e.g. music, gaming, travel"
            />
          </div>
          <div className="form-actions">
            <button type="button" className="btn-secondary" onClick={onBack}>
              Back
            </button>
            <button type="submit" className="btn-primary">
              Start Chatting
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SearchingPanel({ onCancel }) {
  const dots = useRef(0);
  const [dotsText, setDotsText] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      dots.current = (dots.current + 1) % 4;
      setDotsText('.'.repeat(dots.current));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="searching-panel">
      <div className="searching-card">
        <div className="spinner" />
        <h2>Finding someone to chat with{dotsText}</h2>
        <p>Connecting you with a random stranger...</p>
        <button className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
