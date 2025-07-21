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
  private static readonly BIT_DURATION = 0.2; // 每个bit持续200ms（进一步延长）
  private static readonly FREQ_0 = 2000; // 表示0的频率 - 2kHz
  private static readonly FREQ_1 = 5000; // 表示1的频率 - 5kHz（更大差异）
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

    // 使用更清晰的帧格式：开始标记 + 数据 + 结束标记
    const startMarker = '1100'; // 开始标记
    const endMarker = '0011';   // 结束标记
    const data = this.textToBinary(text);
    const frame = startMarker + data + endMarker;

    console.log(`Sending frame: ${frame}`);
    console.log(`- Start: ${startMarker}`);
    console.log(`- Data("${text}"): ${data}`);
    console.log(`- End: ${endMarker}`);

    const duration = frame.length * AudioUtils.BIT_DURATION + 1.0; // 1秒缓冲

    // 创建音频buffer
    const buffer = this.audioContext.createBuffer(1, duration * AudioUtils.SAMPLE_RATE, AudioUtils.SAMPLE_RATE);
    const data_buffer = buffer.getChannelData(0);

    // 500ms前导静音
    const silentSamples = 0.5 * AudioUtils.SAMPLE_RATE;

    // 生成RTZ-FSK调制信号
    for (let i = 0; i < frame.length; i++) {
      const bit = frame[i];
      const frequency = bit === '0' ? AudioUtils.FREQ_0 : AudioUtils.FREQ_1;
      const startSample = silentSamples + i * AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;
      const endSample = startSample + AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;

      for (let sample = startSample; sample < endSample && sample < data_buffer.length; sample++) {
        const time = sample / AudioUtils.SAMPLE_RATE;
        data_buffer[sample] = Math.sin(2 * Math.PI * frequency * time) * 0.3;
      }
    }

    // 播放信号
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);
    source.start();

    // 等待播放完成
    return new Promise(resolve => {
      setTimeout(resolve, duration * 1000);
    });
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
  analyzeSpectrum(): {
    freq0: number;
    freq1: number;
    detected: boolean;
    detectedBit?: '0' | '1';
    signalQuality: number;
  } {
    if (!this.analyser) {
      return { freq0: 0, freq1: 0, detected: false, signalQuality: 0 };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const nyquist = AudioUtils.SAMPLE_RATE / 2;
    const binSize = nyquist / bufferLength;

    // 计算目标频率对应的bin索引，使用更宽的频率窗口
    const bin0 = Math.round(AudioUtils.FREQ_0 / binSize);
    const bin1 = Math.round(AudioUtils.FREQ_1 / binSize);
    const windowSize = 3; // 使用±3个bin的窗口

    // 计算每个频率的平均能量
    let energy0 = 0;
    let energy1 = 0;

    for (let i = -windowSize; i <= windowSize; i++) {
      const idx0 = bin0 + i;
      const idx1 = bin1 + i;

      if (idx0 >= 0 && idx0 < bufferLength) {
        energy0 += dataArray[idx0];
      }
      if (idx1 >= 0 && idx1 < bufferLength) {
        energy1 += dataArray[idx1];
      }
    }

    energy0 /= (windowSize * 2 + 1);
    energy1 /= (windowSize * 2 + 1);

    // 计算背景噪声水平
    let noiseLevel = 0;
    let noiseCount = 0;
    for (let i = 0; i < bufferLength; i++) {
      // 排除目标频率附近的bin
      if (Math.abs(i - bin0) > windowSize * 2 && Math.abs(i - bin1) > windowSize * 2) {
        noiseLevel += dataArray[i];
        noiseCount++;
      }
    }
    noiseLevel = noiseCount > 0 ? noiseLevel / noiseCount : 50;

    // 动态阈值：基于噪声水平
    const dynamicThreshold = Math.max(noiseLevel + 15, 30); // 大幅降低阈值

    // 检测信号
    const maxEnergy = Math.max(energy0, energy1);
    const detected = maxEnergy > dynamicThreshold;

    // 每100次循环输出一次调试信息（避免日志过多）
    if (Math.random() < 0.01) {
      console.log(`Spectrum: freq0=${Math.round(energy0)}, freq1=${Math.round(energy1)}, noise=${Math.round(noiseLevel)}, threshold=${Math.round(dynamicThreshold)}, detected=${detected}`);
    }

    // 计算信号质量
    const signalToNoise = maxEnergy / (noiseLevel + 1);
    const signalQuality = Math.min(100, Math.max(0, (signalToNoise - 1) * 20));

    // 确定检测到的bit
    let detectedBit: '0' | '1' | undefined;
    if (detected) {
      const energyDiff = Math.abs(energy0 - energy1);
      const totalEnergy = energy0 + energy1;
      const minEnergyForBit = totalEnergy * 0.3; // 需要至少30%的能量差异

      // 只有当两个频率的能量差异足够大，且其中一个明显更强时才确定bit
      if (energyDiff > minEnergyForBit && energyDiff > 40) { // 绝对差异至少40
        detectedBit = energy1 > energy0 ? '1' : '0';
        console.log(`Strong signal detected: bit=${detectedBit}, energy0=${Math.round(energy0)}, energy1=${Math.round(energy1)}, diff=${Math.round(energyDiff)}, quality=${Math.round(signalQuality)}`);
      } else {
        // 信号不够清晰，不确定bit值
        console.log(`Weak signal: energy0=${Math.round(energy0)}, energy1=${Math.round(energy1)}, diff=${Math.round(energyDiff)} (need >${Math.round(minEnergyForBit)})`);
      }
    }

    return {
      freq0: Math.round(energy0),
      freq1: Math.round(energy1),
      detected,
      detectedBit,
      signalQuality: Math.round(signalQuality)
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
