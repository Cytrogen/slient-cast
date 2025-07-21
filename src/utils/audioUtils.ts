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
  private static readonly PREAMBLE = '10101010'; // 前导码：交替的0和1用于同步
  private static readonly MIN_SNR = 3.0; // 最小信噪比
  private static readonly MIN_SIGNAL_STRENGTH = 80; // 最小信号强度

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

    const dataBinary = this.textToBinary(text);
    // 添加前导码和结束码
    const fullBinary = AudioUtils.PREAMBLE + dataBinary + '11111111'; // 结束标记
    const duration = fullBinary.length * AudioUtils.BIT_DURATION;

    console.log(`Transmitting: "${text}" -> ${dataBinary} (with preamble: ${fullBinary})`);

    // 创建音频buffer
    const buffer = this.audioContext.createBuffer(1, duration * AudioUtils.SAMPLE_RATE, AudioUtils.SAMPLE_RATE);
    const data = buffer.getChannelData(0);

    // 生成RTZ-FSK调制信号
    for (let i = 0; i < fullBinary.length; i++) {
      const bit = fullBinary[i];
      const frequency = bit === '0' ? AudioUtils.FREQ_0 : AudioUtils.FREQ_1;
      const startSample = i * AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;
      const endSample = startSample + AudioUtils.BIT_DURATION * AudioUtils.SAMPLE_RATE;

      for (let sample = startSample; sample < endSample; sample++) {
        const time = sample / AudioUtils.SAMPLE_RATE;
        data[sample] = Math.sin(2 * Math.PI * frequency * time) * 0.2; // 增加音量
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
  analyzeSpectrum(): {
    freq0: number;
    freq1: number;
    detected: boolean;
    bit?: string;
    quality: number;
    snr: number;
  } {
    if (!this.analyser) {
      return { freq0: 0, freq1: 0, detected: false, quality: 0, snr: 0 };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    const nyquist = AudioUtils.SAMPLE_RATE / 2;
    const binSize = nyquist / bufferLength;

    // 计算目标频率对应的bin索引
    const bin0 = Math.round(AudioUtils.FREQ_0 / binSize);
    const bin1 = Math.round(AudioUtils.FREQ_1 / binSize);

    // 计算频率带宽内的平均能量（提高检测精度）
    const bandwidth = 3; // 检查3个bin的范围
    const energy0 = this.getAverageEnergy(dataArray, bin0, bandwidth);
    const energy1 = this.getAverageEnergy(dataArray, bin1, bandwidth);

    // 计算背景噪声水平
    const noiseLevel = this.calculateNoiseLevel(dataArray, bin0, bin1);

    // 计算信噪比
    const maxEnergy = Math.max(energy0, energy1);
    const snr = noiseLevel > 0 ? maxEnergy / noiseLevel : 0;

    // 改进的信号检测逻辑
    const energyDiff = Math.abs(energy0 - energy1);
    const minEnergyThreshold = AudioUtils.MIN_SIGNAL_STRENGTH;
    const minSNR = AudioUtils.MIN_SNR;

    const strongSignal = maxEnergy > minEnergyThreshold && snr > minSNR;
    const significantDiff = energyDiff > Math.max(maxEnergy * 0.3, 30);

    const detected = strongSignal && significantDiff;
    let bit: string | undefined;
    let quality = 0;

    if (detected) {
      bit = energy1 > energy0 ? '1' : '0';
      quality = Math.min(100, Math.round((energyDiff / maxEnergy) * 100));

      console.log(`Signal detected: bit=${bit}, energy0=${energy0}, energy1=${energy1}, diff=${energyDiff}, SNR=${snr.toFixed(2)}, quality=${quality}`);
    }

    return {
      freq0: energy0,
      freq1: energy1,
      detected,
      bit,
      quality,
      snr
    };
  }

  /**
   * 计算指定频率范围内的平均能量
   */
  private getAverageEnergy(dataArray: Uint8Array, centerBin: number, bandwidth: number): number {
    let sum = 0;
    let count = 0;

    for (let i = Math.max(0, centerBin - bandwidth); i <= Math.min(dataArray.length - 1, centerBin + bandwidth); i++) {
      sum += dataArray[i];
      count++;
    }

    return count > 0 ? sum / count : 0;
  }

  /**
   * 计算背景噪声水平
   */
  private calculateNoiseLevel(dataArray: Uint8Array, bin0: number, bin1: number): number {
    let noiseSum = 0;
    let noiseCount = 0;

    // 采样远离目标频率的区域作为噪声参考
    const avoidRange = 10;

    for (let i = 0; i < dataArray.length; i++) {
      const farFromBin0 = Math.abs(i - bin0) > avoidRange;
      const farFromBin1 = Math.abs(i - bin1) > avoidRange;

      if (farFromBin0 && farFromBin1) {
        noiseSum += dataArray[i];
        noiseCount++;
      }
    }

    return noiseCount > 0 ? noiseSum / noiseCount : 0;
  }

  /**
   * 解码接收到的二进制数据，支持前导码检测
   */
  decodeBinaryWithPreamble(binaryString: string): {
    decoded: string;
    isComplete: boolean;
    hasValidPreamble: boolean;
  } {
    // 查找前导码
    const preambleIndex = binaryString.indexOf(AudioUtils.PREAMBLE);

    if (preambleIndex === -1) {
      return { decoded: '', isComplete: false, hasValidPreamble: false };
    }

    // 提取前导码后的数据
    const dataStart = preambleIndex + AudioUtils.PREAMBLE.length;
    const dataSection = binaryString.substring(dataStart);

    // 查找结束标记
    const endMarkerIndex = dataSection.indexOf('11111111');

    if (endMarkerIndex === -1) {
      // 还没有接收到完整的消息
      return { decoded: '', isComplete: false, hasValidPreamble: true };
    }

    // 提取实际的数据部分
    const actualData = dataSection.substring(0, endMarkerIndex);

    // 确保数据长度是8的倍数（完整的字符）
    const completeBytes = Math.floor(actualData.length / 8) * 8;
    const validData = actualData.substring(0, completeBytes);

    try {
      const decoded = this.binaryToText(validData);
      return {
        decoded,
        isComplete: true,
        hasValidPreamble: true
      };
    } catch (error) {
      return { decoded: '', isComplete: false, hasValidPreamble: true };
    }
  }

  /**
   * 解码接收到的二进制数据（兼容旧版本）
   */
  decodeBinary(binaryString: string): string {
    const result = this.decodeBinaryWithPreamble(binaryString);
    if (result.isComplete) {
      return result.decoded;
    }
    throw new Error('Invalid or incomplete binary data received');
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
