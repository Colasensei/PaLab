/**
 * 音频管理器 — 控制歌曲播放和速度
 */
export class AudioManager {
  private audio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private playbackRate: number = 1;
  private startOffset: number = 0;
  private startedAt: number = 0;
  private _isPlaying: boolean = false;
  private _duration: number = 0;
  private _onEnded: (() => void) | null = null;
  private _srcUrl: string | null = null;

  async load(url: string): Promise<number> {
    this.stop();
    this._srcUrl = url;
    this.audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      if (!this.audio) return reject();
      this.audio.addEventListener('loadedmetadata', () => resolve(), { once: true });
      this.audio.addEventListener('error', reject, { once: true });
    });
    this._duration = this.audio.duration * 1000;
    this.audio.addEventListener('ended', () => this._onEnded?.());
    return this._duration;
  }

  play(rate: number = 1) {
    if (!this.audio) return;
    this.playbackRate = rate;
    this.audio.playbackRate = rate;
    this.audio.currentTime = 0;
    this.audio.play();
    this._isPlaying = true;
    this.startedAt = performance.now();
  }

  pause() {
    if (!this.audio) return;
    this.audio.pause();
    this._isPlaying = false;
  }

  private reloadAudio(pos: number): void {
    if (!this._srcUrl) return;
    this.audio = new Audio(this._srcUrl);
    const onReady = () => {
      if (!this.audio) return;
      this.audio.currentTime = pos;
      this.audio.playbackRate = this.playbackRate;
      this.audio.play().then(() => { this._isPlaying = true; }).catch(() => {});
    };
    if (this.audio.readyState > 0) onReady();
    else this.audio.addEventListener('loadedmetadata', onReady, { once: true });
  }

  resume() {
    if (!this.audio) return;
    this.audio.playbackRate = this.playbackRate;
    this.audio.play().then(
      () => { this._isPlaying = true; },
      () => { /* 静默失败 */ },
    );
  }

  stop() {
    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
      this._isPlaying = false;
    }
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch {}
      this.sourceNode = null;
    }
  }

  setRate(rate: number) {
    this.playbackRate = rate;
    if (this.audio) {
      this.audio.playbackRate = rate;
    }
  }

  setVolume(v: number) {
    // 0~1
    if (this.audio) this.audio.volume = Math.max(0, Math.min(1, v));
  }

  /** 获取当前播放位置 (ms)，暂停时也返回正确值 */
  getCurrentTime(): number {
    if (!this.audio) return 0;
    return this.audio.currentTime * 1000;
  }

  get isPlaying(): boolean { return this._isPlaying; }
  get duration(): number { return this._duration; }
  getAudioElement(): HTMLAudioElement | null { return this.audio; }

  onEnded(cb: () => void) {
    this._onEnded = cb;
    if (this.audio) {
      this.audio.addEventListener('ended', cb);
    }
  }
}

/** 单例 */
export const audioManager = new AudioManager();
