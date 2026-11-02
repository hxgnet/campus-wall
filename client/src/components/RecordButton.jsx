import { useEffect, useRef, useState } from 'react';

// 语音录制按钮：录制完成后把 File 交给调用方上传
export default function RecordButton({ onRecorded, disabled }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      alert('当前环境不支持录音，请改用「语音」文件上传');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type });
        onRecorded(file);
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => {
        if (s >= 59) { stop(); return 60; }
        return s + 1;
      }), 1000);
    } catch (e) {
      alert('无法使用麦克风，请检查定位/录音权限，或直接上传语音文件');
    }
  };

  const stop = () => {
    clearInterval(timerRef.current);
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  return (
    <button
      type="button"
      className={`media-btn ${recording ? 'recording' : ''}`}
      disabled={disabled}
      onClick={recording ? stop : start}
      title={recording ? '点击结束录音' : '录制语音'}
    >
      {recording ? `⏹ ${seconds}s` : '🎙️'}
    </button>
  );
}
