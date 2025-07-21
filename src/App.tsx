import React, { useState } from 'react';
import { Transmitter } from './components/Transmitter';
import { Receiver } from './components/Receiver';

interface ActivityLog {
  timestamp: number;
  type: 'sent' | 'received' | 'error';
  message: string;
}

/**
 * SilentCast主应用组件
 * 整合发送和接收功能，提供统一的用户界面
 */
function App() {
  const [transmitterStatus, setTransmitterStatus] = useState('Ready to transmit');
  const [receiverStatus, setReceiverStatus] = useState('Not listening');
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);

  /**
   * 添加活动日志
   */
  const addToLog = (type: ActivityLog['type'], message: string) => {
    setActivityLog(prev => [
      ...prev,
      {
        timestamp: Date.now(),
        type,
        message
      }
    ].slice(-10)); // 保留最近10条记录
  };

  /**
   * 处理接收到的消息
   */
  const handleMessageReceived = (message: string) => {
    addToLog('received', message);
  };

  /**
   * 处理发送状态变化
   */
  const handleTransmitterStatusChange = (status: string) => {
    setTransmitterStatus(status);
    if (status.includes('complete')) {
      addToLog('sent', 'Message transmitted successfully');
    } else if (status.includes('Error')) {
      addToLog('error', status);
    }
  };

  /**
   * 处理接收状态变化
   */
  const handleReceiverStatusChange = (status: string) => {
    setReceiverStatus(status);
    if (status.includes('Error')) {
      addToLog('error', status);
    }
  };

  /**
   * 格式化时间戳
   */
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  /**
   * 清空活动日志
   */
  const clearLog = () => {
    setActivityLog([]);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            SilentCast
          </h1>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Ultrasonic Communication System - MVP Demo
          </p>
          <div className="mt-4 text-sm text-gray-500">
            Test the ultrasonic communication between devices.
            Use the transmitter to send messages and the receiver to listen for them.
          </div>
        </header>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          <Transmitter
            onStatusChange={handleTransmitterStatusChange}
          />
          <Receiver
            onMessageReceived={handleMessageReceived}
            onStatusChange={handleReceiverStatusChange}
          />
        </div>

        <div className="bg-white rounded-lg shadow-md p-6 max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">
              Activity Log
            </h3>
            <button
              onClick={clearLog}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Clear Log
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 p-3 rounded-md">
              <div className="text-sm font-medium text-blue-800">
                Transmitter Status
              </div>
              <div className="text-sm text-blue-600">
                {transmitterStatus}
              </div>
            </div>
            <div className="bg-green-50 p-3 rounded-md">
              <div className="text-sm font-medium text-green-800">
                Receiver Status
              </div>
              <div className="text-sm text-green-600">
                {receiverStatus}
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-48 overflow-y-auto">
            {activityLog.length === 0 ? (
              <div className="text-center text-gray-500 py-4">
                No activity yet. Try sending a message!
              </div>
            ) : (
              activityLog.map((log, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-md text-sm ${
                    log.type === 'sent' ? 'bg-blue-100 text-blue-800' :
                      log.type === 'received' ? 'bg-green-100 text-green-800' :
                        'bg-red-100 text-red-800'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-medium">
                      {log.type === 'sent' ? 'Sent' :
                        log.type === 'received' ? 'Received' :
                          'Error'}
                    </span>
                    <span className="text-xs opacity-75">
                      {formatTimestamp(log.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1">
                    {log.message}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            For best results, use devices close to each other (within 1-2 meters).
          </p>
          <p>
            Make sure to grant microphone permissions and use in a quiet environment.
          </p>
        </div>
      </div>
    </div>
  );
}

export default App;
