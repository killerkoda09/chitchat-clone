import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';

const BLINK_THRESHOLD = 0.22;
const EYE_OPEN_THRESHOLD = 0.28;
const LIVENESS_FRAMES = 60;

function getEAR(landmarks) {
  const leftEye = landmarks.positions.slice(36, 42);
  const rightEye = landmarks.positions.slice(42, 48);

  const earLeft = (
    dist(leftEye[1], leftEye[5]) + dist(leftEye[2], leftEye[4])
  ) / (2 * dist(leftEye[0], leftEye[3]));

  const earRight = (
    dist(rightEye[1], rightEye[5]) + dist(rightEye[2], rightEye[4])
  ) / (2 * dist(rightEye[0], rightEye[3]));

  return (earLeft + earRight) / 2;
}

function dist(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export default function FaceVerification({ selectedGender, onVerified }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const earHistoryRef = useRef([]);
  const blinkCountRef = useRef(0);
  const eyeClosedRef = useRef(false);
  const frameCountRef = useRef(0);
  const [status, setStatus] = useState('loading');
  const [statusText, setStatusText] = useState('Loading face detection models...');
  const [errorDetail, setErrorDetail] = useState('');

  async function loadModels() {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.ageGenderNet.loadFromUri(MODEL_URL),
      ]);
      return true;
    } catch (err) {
      setErrorDetail(err?.message || String(err));
      console.error('Model load error:', err);
      return false;
    }
  }

  const runDetection = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    if (!displaySize.width || !displaySize.height) return;
    faceapi.matchDimensions(canvas, displaySize);

    let detections;
    try {
      detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320 }))
        .withFaceLandmarks()
        .withAgeAndGender();
    } catch {
      return;
    }

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (detections.length === 0) {
      setStatusText('No face detected. Please look at the camera.');
      return;
    }

    if (detections.length > 1) {
      setStatusText('Multiple faces detected. Please be alone in frame.');
      return;
    }

    const result = detections[0];
    const resized = faceapi.resizeResults(result, displaySize);
    faceapi.draw.drawDetections(canvas, resized);
    faceapi.draw.drawFaceLandmarks(canvas, resized);

    const ear = getEAR(result.landmarks);

    if (status === 'liveness') {
      frameCountRef.current++;

      earHistoryRef.current.push(ear);
      if (earHistoryRef.current > LIVENESS_FRAMES) {
        earHistoryRef.current.shift();
      }

      if (ear < BLINK_THRESHOLD && !eyeClosedRef.current) {
        eyeClosedRef.current = true;
      }

      if (ear > EYE_OPEN_THRESHOLD && eyeClosedRef.current) {
        blinkCountRef.current++;
        eyeClosedRef.current = false;
        setStatusText(`✓ Blink detected! (${blinkCountRef.current}/2)`);
      }

      ctx.fillStyle = '#ffffff';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(`EAR: ${ear.toFixed(3)}`, 10, 70);

      if (blinkCountRef.current >= 2) {
        setStatus('verifying');
        setStatusText('Checking gender...');
        blinkCountRef.current = 0;
        earHistoryRef.current = [];
        return;
      }

      if (frameCountRef.current > 300) {
        setStatus('error');
        setStatusText('Liveness check timed out. Please look at the camera and blink naturally.');
        return;
      }
    }

    if (status === 'verifying' || status === 'liveness-done') {
      const detectedGender = result.gender.toLowerCase();
      const genderMatch =
        detectedGender === selectedGender ||
        (selectedGender === 'other' && detectedGender !== 'male' && detectedGender !== 'female');

      ctx.font = '24px system-ui, sans-serif';
      ctx.fillStyle = genderMatch ? '#4ade80' : '#f87171';
      ctx.fillText(`${result.gender} (${Math.round(result.genderProbability * 100)}%)`, 10, 40);

      if (genderMatch) {
        setStatus('verified');
        setStatusText(`✓ Gender verified as ${detectedGender}! You are real.`);
        setTimeout(() => {
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          onVerified(detectedGender);
        }, 1500);
      } else {
        setStatusText(
          selectedGender === 'male'
            ? `✗ No male face detected. Detected: ${detectedGender}.`
            : selectedGender === 'female'
              ? `✗ No female face detected. Detected: ${detectedGender}.`
              : `✗ Gender mismatch. Detected: ${detectedGender}.`
        );
      }
    }
  }, [selectedGender, onVerified, status]);

  useEffect(() => {
    let intervalId;
    let mounted = true;

    async function setup() {
      setStatus('loading');
      setStatusText('Loading face detection models...');

      const modelsLoaded = await loadModels();
      if (!mounted) return;

      if (!modelsLoaded) {
        setStatus('error');
        setStatusText('Failed to load face detection models. Check your internet connection.');
        return;
      }

      setStatusText('Starting camera...');
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: 640, height: 480 },
          audio: false,
        });
      } catch (err) {
        if (!mounted) return;
        setStatus('error');
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setStatusText('Camera not found. Please connect a webcam and refresh.');
        } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setStatusText('Camera access denied. Please allow camera access in your browser settings and refresh.');
        } else {
          setStatusText(`Camera error: ${err.message}. Please refresh and try again.`);
        }
        return;
      }

      if (!mounted) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus('liveness');
      setStatusText('Please blink naturally to prove you are a real person (2 blinks needed)...');

      intervalId = setInterval(runDetection, 300);
    }

    setup();

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [runDetection]);

  const statusLabel =
    status === 'loading' ? 'Loading...' :
    status === 'liveness' ? '' :
    status === 'verifying' ? 'Verifying...' :
    status === 'verified' ? 'Verified ✓' :
    status === 'error' ? 'Error' : '';

  return (
    <div className="face-verification">
      <div className="verification-card">
        <h2>Gender Verification</h2>
        {status === 'liveness' && (
          <p className="verified-hint">
            Selected: <strong>{selectedGender}</strong>. You must blink to prove you are a real person.
          </p>
        )}
        {status !== 'liveness' && (
          <p className="verified-hint">
            Selected: <strong>{selectedGender}</strong>. Verification is required to continue.
          </p>
        )}
        <div className="video-container">
          <video ref={videoRef} className="video-feed" playsInline muted />
          <canvas ref={canvasRef} className="video-overlay" />
          {status === 'loading' && (
            <div className="video-placeholder">
              <div className="spinner" />
              <p>Loading...</p>
            </div>
          )}
          {status === 'error' && (
            <div className="video-placeholder">
              <p>⚠️ {statusText}</p>
              {errorDetail && <p className="error-detail">{errorDetail}</p>}
            </div>
          )}
        </div>
        <p className={`status-text ${status === 'liveness' || status === 'verifying' ? 'status-active' : status === 'error' ? 'status-error' : status === 'verified' ? 'status-active' : ''}`}>
          {statusLabel && <span className="status-label">{statusLabel}</span>}
          {statusText}
        </p>
        {status === 'error' && (
          <button className="btn-primary" onClick={() => window.location.reload()}>
            Refresh & Retry
          </button>
        )}
      </div>
    </div>
  );
}
