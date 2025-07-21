import React, { useState, useRef, useEffect, useCallback } from 'react';
import { AudioUtils } from '../utils/audioUtils';

interface ReceiverProps {
  onMessageReceived?: (message: string) => void;
  onStatusChange?: (status: string) => void;
}

/**
 * 超声波信号接收组件
 * 监听麦克风输入并解码接收到的信号
 */
export const Receiver: React.FC<ReceiverProps> = ({ onMessageReceived, onStatusChange }) => {
  const [isListening, setIsListening] = useState(false);
  const [status, setStatus] = useState('Not listening');
  const [receivedMessage, setReceivedMessage] = useState('');
  const [signalStrength, setSignalStrength] = useState({ freq0: 0, freq1: 0 });
  const [detectedBits, setDetectedBits] = useState('');

  const audioUtilsRef = useRef<AudioUtils | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const binaryBufferRef = useRef<string>('');
  const lastDetectionRef = useRef<number>(0);

  useEffect(() => {
    audioUtilsRef.current = new AudioUtils();

    return () => {
      if (audioUtilsRef.current) {
        audioUtilsRef.current.cleanup();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  /**
   * 监听循环 - 持续分析音频频谱
   */
  const listenLoop = useCallback(() => {
    if (!audioUtilsRef.current || !isListening) {
      return;
    }

    const analysis = audioUtilsRef.current.analyzeSpectrum();
    setSignalStrength({ freq0: analysis.freq0, freq1: analysis.freq1 });

    if (analysis.detected) {
      const currentTime = Date.now();

      // 防止重复检测同一个bit
      if (currentTime - lastDetectionRef.current > 50) {
        const detectedBit = analysis.freq1 > analysis.freq0 ? '1' : '0';
        binaryBufferRef.current += detectedBit;
        setDetectedBits(binaryBufferRef.current);
        lastDetectionRef.current = currentTime;

        // 尝试解码完整的8位字符
        if (binaryBufferRef.current.length >= 8 && binaryBufferRef.current.length % 8 === 0) {
          try {
            const decoded = audioUtilsRef.current.decodeBinary(binaryBufferRef.current);
            setReceivedMessage(decoded);
            onMessageReceived?.(decoded);
            setStatus(`Received: "${decoded}"`);
          } catch (error) {
            // 继续监听，可能需要更多数据
          }
        }
      }
    }

    animationFrameRef.current = requestAnimationFrame(listenLoop);
  }, [isListening, onMessageReceived]);

  /**
   * 开始监听
   */
  const startListening = async () => {
    if (!audioUtilsRef.current) return;

    try {
      setStatus('Requesting microphone access...');
      await audioUtilsRef.current.startListening();

      setIsListening(true);
      setStatus('Listening for signals...');
      setReceivedMessage('');
      setDetectedBits('');
      binaryBufferRef.current = '';

      listenLoop();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to start listening';
      setStatus(`Error: ${errorMessage}`);
    }
  };

  /**
   * 停止监听
   */
  const stopListening = () => {
    if (audioUtilsRef.current) {
      audioUtilsRef.current.stopListening();
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setIsListening(false);
    setStatus('Not listening');
    setSignalStrength({ freq0: 0, freq1: 0 });
  };

  /**
   * 清除接收到的数据
   */
  const clearReceived = () => {
    setReceivedMessage('');
    setDetectedBits('');
    binaryBufferRef.current = '';
    if (isListening) {
      setStatus('Listening for signals...');
    }
  };

  useEffect(() => {
    if (isListening) {
      listenLoop();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isListening, listenLoop]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">
        Ultrasonic Receiver
      </h2>

      <div className="space-y-4">
        <div className="flex space-x-2">
          <button
            onClick={startListening}
            disabled={isListening}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
              isListening
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-green-500 text-white hover:bg-green-600 active:bg-green-700'
            }`}
          >
            Start Listening
          </button>

          <button
            onClick={stopListening}
            disabled={!isListening}
            className={`flex-1 py-3 px-4 rounded-md font-medium transition-colors ${
              !isListening
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-red-500 text-white hover:bg-red-600 active:bg-red-700'
            }`}
          >
            Stop Listening
          </button>
        </div>

        <div className="text-center">
          <span className={`text-sm font-medium ${
            status.includes('Error') ? 'text-red-600' :
              status.includes('Received') ? 'text-green-600' :
                isListening ? 'text-blue-600' : 'text-gray-600'
          }`}>
            {status}
          </span>
        </div>

        {isListening && (
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-xs text-gray-600 mb-2">Signal Strength:</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-blue-100 p-2 rounded">
                <div>Freq 0 (17.5kHz)</div>
                <div className="font-mono">{signalStrength.freq0}</div>
              </div>
              <div className="bg-green-100 p-2 rounded">
                <div>Freq 1 (18.5kHz)</div>
                <div className="font-mono">{signalStrength.freq1}</div>
              </div>
            </div>
          </div>
        )}

        {detectedBits && (
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-xs text-gray-600 mb-1">Detected bits:</div>
            <div className="text-xs font-mono text-gray-800 break-all">
              {detectedBits}
            </div>
          </div>
        )}

        {receivedMessage && (
          <div className="bg-green-50 p-3 rounded-md">
            <div className="flex justify-between items-start mb-2">
              <div className="text-xs text-green-600 font-medium">Received Message:</div>
              <button
                onClick={clearReceived}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Clear
              </button>
            </div>
            <div className="text-sm text-green-800 font-medium">
              "{receivedMessage}"
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
