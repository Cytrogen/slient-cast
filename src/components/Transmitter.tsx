import React, { useState, useRef, useEffect } from 'react';
import { AudioUtils } from '../utils/audioUtils';

interface TransmitterProps {
  onStatusChange?: (status: string) => void;
}

/**
 * 超声波信号发送组件
 * 提供文本输入和发送功能
 */
export const Transmitter: React.FC<TransmitterProps> = ({ onStatusChange }) => {
  const [message, setMessage] = useState('');
  const [isTransmitting, setIsTransmitting] = useState(false);
  const [status, setStatus] = useState('Ready to transmit');
  const audioUtilsRef = useRef<AudioUtils | null>(null);

  useEffect(() => {
    audioUtilsRef.current = new AudioUtils();

    return () => {
      if (audioUtilsRef.current) {
        audioUtilsRef.current.cleanup();
      }
    };
  }, []);

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  /**
   * 处理文本发送
   */
  const handleTransmit = async () => {
    if (!message.trim() || !audioUtilsRef.current) {
      return;
    }

    setIsTransmitting(true);
    setStatus('Initializing audio...');

    try {
      await audioUtilsRef.current.initAudioContext();
      setStatus('Transmitting signal...');

      console.log(`Transmitting message: "${message}"`);
      console.log(`Binary (with preamble): 10101010${audioUtilsRef.current.textToBinary(message)}`);

      // 等待传输完成
      await audioUtilsRef.current.transmitText(message);

      setStatus('Transmission complete');
      console.log('Transmission completed');
      setTimeout(() => setStatus('Ready to transmit'), 2000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Transmission failed';
      setStatus(`Error: ${errorMessage}`);
      console.error('Transmission error:', error);
      setTimeout(() => setStatus('Ready to transmit'), 3000);
    } finally {
      setIsTransmitting(false);
    }
  };

  /**
   * 处理键盘事件
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isTransmitting) {
      e.preventDefault();
      handleTransmit();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-gray-800 mb-4">
        Ultrasonic Transmitter
      </h2>

      <div className="space-y-4">
        <div>
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
            Message to transmit:
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isTransmitting}
            className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            rows={3}
            placeholder="Enter your message here..."
            maxLength={100}
          />
          <div className="text-xs text-gray-500 mt-1">
            {message.length}/100 characters
          </div>
        </div>

        <button
          onClick={handleTransmit}
          disabled={isTransmitting || !message.trim()}
          className={`w-full py-3 px-4 rounded-md font-medium transition-colors ${
            isTransmitting || !message.trim()
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700'
          }`}
        >
          {isTransmitting ? 'Transmitting...' : 'Transmit Signal'}
        </button>

        <div className="text-center">
          <span className={`text-sm font-medium ${
            status.includes('Error') ? 'text-red-600' :
              status.includes('complete') ? 'text-green-600' :
                'text-blue-600'
          }`}>
            {status}
          </span>
        </div>

        {message && (
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-xs text-gray-600 mb-1">Binary representation (no preamble for now):</div>
            <div className="text-xs font-mono text-gray-800 break-all">
              {audioUtilsRef.current?.textToBinary(message) || ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
