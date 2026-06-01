import React, { useRef, useEffect, useState } from 'react';
import * as faceapi from 'face-api.js';

const MODEL_URL = '/models';

const POSITION_BUFFER_SIZE = 5;
const MOTION_THRESHOLD = 6;
const LIVENESS_FRAMES_NEEDED = 3;
const TIMEOUT_FRAMES = 100;

export default function FaceVerification({ selectedGender, onVerified }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const phaseRef = useRef('loading');
  const intervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const positionHistoryRef = useRef([]);
  const motionCountRef = useRef(0);

  const [status, setStatus] = useState('loading');
  const [statusText, setStatusText] = useState('Loading face detection models...');
  const [errorDetail, setErrorDetail] = useState('');

  function setPhase(newPhase) {
    phaseRef.current = newPhase;
    setStatus(newPhase);
  }

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

  useEffect(() => {
    let mounted = true;

    async function setup() {
      setStatusText('Loading face detection models...');

      const modelsLoaded = await loadModels();
      if (!mounted) return;

      if (!modelsLoaded) {
        setPhase('error');
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
        setPhase('error');
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

      setPhase('liveness');
      setStatusText('Move your head slightly to prove you are a real person...');

      intervalRef.current = setInterval(runDetection, 300);
    }

    setup();

    return () => {
      mounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  async function runDetection() {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    if (!displaySize.width || !displaySize.height) return;
    faceapi.matchDimensions(canvas, displaySize);

    let detections;
    try {
      detections = await faceapi
        .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 416 }))
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

    const currentPhase = phaseRef.current;

    if (currentPhase === 'liveness') {
      frameCountRef.current++;

      const cx = result.detection.box.x + result.detection.box.width / 2;
      const cy = result.detection.box.y + result.detection.box.height / 2;

      const hist = positionHistoryRef.current;
      hist.push({ x: cx, y: cy });
      if (hist.length > POSITION_BUFFER_SIZE) {
        hist.shift();
      }

      const motion = hist.length >= POSITION_BUFFER_SIZE
        ? hist.reduce((maxDist, p) => {
            const d = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
            return Math.max(maxDist, d);
          }, 0)
        : 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(`Motion: ${motion.toFixed(1)}px`, 10, 70);

      if (motion > MOTION_THRESHOLD) {
        motionCountRef.current++;
        positionHistoryRef.current = [];
        setStatusText(
          `✓ Movement ${motionCountRef.current}/${LIVENESS_FRAMES_NEEDED} detected!`
        );
      } else if (motionCountRef.current < LIVENESS_FRAMES_NEEDED && frameCountRef.current % 10 === 0) {
        setStatusText(
          `Move your head slightly... (motion: ${motion.toFixed(1)}px, need > ${MOTION_THRESHOLD}px)`
        );
      }

      if (motionCountRef.current >= LIVENESS_FRAMES_NEEDED) {
        setPhase('verifying');
        setStatusText('Checking gender...');
        motionCountRef.current = 0;
        return;
      }

      if (frameCountRef.current > TIMEOUT_FRAMES) {
        setPhase('error');
        setStatusText('Liveness check timed out. Please move your head slightly and try again.');
        return;
      }
    }

    if (currentPhase === 'verifying') {
      if (!result.gender) {
        setStatusText('Gender detection unavailable. Check console for details.');
        console.error('Gender result undefined:', result);
        return;
      }

      const detectedGender = result.gender.toLowerCase();
      const genderProb = result.genderProbability;

      ctx.font = '20px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`Gender: ${detectedGender} (${Math.round(genderProb * 100)}%)`, 10, 40);
      ctx.fillText(`Age: ~${Math.round(result.age)}`, 10, 70);

      const genderMatch =
        detectedGender === selectedGender ||
        (selectedGender === 'other' && detectedGender !== 'male' && detectedGender !== 'female');

      if (genderMatch) {
        setPhase('verified');
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
  }

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
            Selected: <strong>{selectedGender}</strong>. Move your head slightly to prove you are real.
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
