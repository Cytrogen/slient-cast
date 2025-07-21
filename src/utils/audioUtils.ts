/**
 * 超声波音频处理工具类
 * 负责音频信号的生成、编码、解码和频谱分析
 */

export class AudioUtils {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private oscillator: OscillatorNode | null = null;

  // 信号参数配置
  private static readonly CARRIER_FREQUENCY = 18000; // 18kHz载波频率
  private static readonly BIT_DURATION = 0.1; // 每个bit持续100ms
  private static readonly FREQ_0 = 17500; // 表示0的频率
  private static readonly FREQ_1 = 18500; // 表示1的频率
  private static readonly SAMPLE_RATE = 44100;

  /**
   * 初始化音频上下文
   */
  async initAudioContext(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * 将文本转换为二进制字符串
   */
  textToBinary(text: string): string {
    return text
      .split('')
      .map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
      .join('');
  }

  /**
   * 将二进制字符串转换为文本
   */
  binaryToText(binary: string): string {
    const chunks = binary.match(/.{1,8}/g) || [];
    return chunks
      .map(chunk => String.fromCharCode(parseInt(chunk, 2)))
      .join('');
  }

  /**
   * 生成超声波信号发送文本
   */
  async transmitText(text: string): Promise<void> {
    await this.initAudioContext();

    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    const binary = this.textToBinary(text);
    const duration = binary.length * AudioUtils.BIT_DURATION;

    // 创建音频buffer
    const buffer = this.audioContext.createBuffer(1, duration * AudioUtils.SAMPLE_RATE, AudioUtils.SAMPLE_RATE);
    const data = buffer.getChannelData(0);

    // 生成RTZ-FSK调制信号
    for (let i = 0; i < binary.length; i++) {
      const bit = binary[i];
      const frequency = bit === '0' ? AudioUtils.FREQ_0 : AudioUtils.FREQ_1;
      const startSample = i * AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;
      const endSample = startSample + AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;

      for (let sample = startSample; sample < endSample; sample++) {
        const time = sample / AudioUtils.SAMPLE_RATE;
        data[sample] = Math.sin(2 * Math.PI * frequency * time) * 0.1; // 低音量避免干扰
      }
    }

    // 播放信号
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();
  }

  /**
   * 开始监听麦克风输入
   */
  async startListening(): Promise<void> {
    await this.initAudioContext();

    if (!this.audioContext) {
      throw new Error('Audio context not initialized');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();

      this.analyser.fftSize = 8192;
      this.analyser.smoothingTimeConstant = 0.3;

      this.microphone.connect(this.analyser);
    } catch (error) {
      throw new Error('Microphone access denied or unavailable');
    }
  }

  /**
   * 停止监听
   */
  stopListening(): void {
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
  }

  /**
   * 分析频谱并检测信号
   */
  analyzeSpectrum(): { freq0: number; freq1: number; detected: boolean } {
    if (!this.analyser) {
      return { freq0: 0, freq1: 0, detected: false };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const nyquist = AudioUtils.SAMPLE_RATE / 2;
    const binSize = nyquist / bufferLength;

    // 计算目标频率对应的bin索引
    const bin0 = Math.round(AudioUtils.FREQ_0 / binSize);
    const bin1 = Math.round(AudioUtils.FREQ_1 / binSize);

    // 获取目标频率的能量
    const energy0 = dataArray[bin0] || 0;
    const energy1 = dataArray[bin1] || 0;

    // 检测阈值
    const threshold = 100;
    const detected = energy0 > threshold || energy1 > threshold;

    return {
      freq0: energy0,
      freq1: energy1,
      detected
    };
  }

  /**
   * 解码接收到的二进制数据
   */
  decodeBinary(binaryString: string): string {
    try {
      return this.binaryToText(binaryString);
    } catch (error) {
      throw new Error('Invalid binary data received');
    }
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    this.stopListening();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}
