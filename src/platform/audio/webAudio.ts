/**
 * The WebAudio implementation of `AudioService`.
 *
 * M1 shipped `NullAudio`: the whole call surface existed and nothing played.
 * The seams were worth getting right early, and this is the collection - the
 * adapter dropped in without a single caller changing.
 *
 * Everything is synthesised (see `synthVoices.ts`). No files, no loading, no
 * decode cost, and a build that is audible from the first commit. Real samples
 * can be registered against the same ids later and will take precedence.
 *
 * Three things this has to get right on a phone:
 *
 * 1. **The autoplay policy.** An `AudioContext` starts suspended until a user
 *    gesture. Creating it at boot and resuming it on the first touch is the
 *    only reliable pattern; anything else produces a game that is silent for
 *    exactly the players who never tap the canvas first.
 * 2. **Never clipping.** Twenty overlapping gunshots through a phone speaker is
 *    distortion, not loudness. A compressor on the master bus is not polish, it
 *    is the difference between "intense" and "broken".
 * 3. **Never allocating in the frame.** Nodes are created per sound and torn
 *    down on `ended`, which is the WebAudio idiom, but the *voice limit* below
 *    is what keeps a firefight from spawning a hundred of them.
 */

import { AMBIENCES, voiceFor, type VoiceDef } from './synthVoices';
import type { AudioService, PlayOptions, SoundId } from './audioService';

/** Simultaneous one-shot voices. Beyond this the oldest is dropped. */
const MAX_VOICES = 24;
/** Metres at which a sound is inaudible. Matches the raid's hearing scale. */
const MAX_DISTANCE = 34;

export class WebAudioService implements AudioService {
  readonly name = 'webaudio';

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private ambienceId: string | null = null;

  private noiseBuffer: AudioBuffer | null = null;
  private activeVoices = 0;
  private listenerX = 0;
  private listenerY = 0;
  private volume = 0.8;
  private unlocked = false;

  /**
   * Create the context and arm the unlock.
   *
   * Safe to call before any user gesture: the context simply stays suspended
   * until one arrives.
   */
  init(): void {
    if (this.ctx) return;

    const Ctor =
      globalThis.AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      this.ctx = new Ctor();
    } catch {
      // Some embeddings forbid audio entirely. Silence is an acceptable outcome.
      return;
    }

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 6;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.18;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(compressor);
    compressor.connect(this.ctx.destination);

    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0;
    this.ambienceGain.connect(this.master);

    this.noiseBuffer = this.createNoiseBuffer(this.ctx);
    this.armUnlock();
  }

  /**
   * Resume the context on the first user gesture.
   *
   * Listens on the document with `once`, for every gesture kind a phone or a
   * desktop can produce, because which one comes first is not predictable.
   */
  private armUnlock(): void {
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      void this.ctx?.resume().catch(() => {
        /* a refused resume leaves the game silent, never broken */
      });
      // Re-apply the ambience the game asked for while we were still muted.
      if (this.ambienceId) this.setAmbience(this.ambienceId);
    };

    for (const event of ['pointerdown', 'touchstart', 'keydown', 'click'] as const) {
      document.addEventListener(event, unlock, { once: true, passive: true });
    }
  }

  play(id: SoundId, options: PlayOptions = {}): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;
    if (this.activeVoices >= MAX_VOICES) return;

    const distanceGain = this.gainForPosition(options);
    if (distanceGain <= 0.01) return;

    const voice = voiceFor(id);
    const rate = options.rate ?? 1;
    const gain = (options.volume ?? 1) * distanceGain;

    const repeats = Math.max(1, voice.repeats ?? 1);
    for (let i = 0; i < repeats; i++) {
      const delay = i * (voice.repeatGapSeconds ?? 0.1);
      this.playVoice(voice, ctx.currentTime + delay, gain, rate, options);
      if (voice.layer) {
        this.playVoice(voice.layer, ctx.currentTime + delay, gain, rate, options);
      }
    }
  }

  /** One synthesised voice: source → filter? → envelope → pan → master. */
  private playVoice(
    voice: VoiceDef,
    startAt: number,
    gainScale: number,
    rate: number,
    options: PlayOptions,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const duration = voice.duration / rate;
    const envelope = ctx.createGain();
    const peak = Math.max(0.0001, voice.gain * gainScale);

    // Linear attack, exponential decay. Exponential cannot reach zero, so it
    // ends on a tiny value and the node is stopped - a linear tail clicks.
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.linearRampToValueAtTime(peak, startAt + Math.max(0.001, voice.attack));
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);

    let node: AudioNode = envelope;

    // Stereo placement from the listener, when the caller gave a position.
    if (options.x !== undefined && options.y !== undefined && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      const dx = options.x - this.listenerX;
      panner.pan.value = Math.max(-0.8, Math.min(0.8, dx / 18));
      envelope.connect(panner);
      node = panner;
    }
    node.connect(master);

    let source: AudioScheduledSourceNode;

    if (voice.kind === 'noise') {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      noise.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = voice.filterHz ?? 1000;
      filter.Q.value = voice.filterQ ?? 1;
      noise.connect(filter);
      filter.connect(envelope);
      source = noise;
    } else {
      const osc = ctx.createOscillator();
      osc.type = voice.kind === 'sweep' ? 'sawtooth' : 'sine';
      osc.frequency.setValueAtTime(voice.startHz * rate, startAt);
      if (voice.kind === 'sweep' && voice.endHz !== undefined) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, voice.endHz * rate),
          startAt + duration,
        );
      }
      osc.connect(envelope);
      source = osc;
    }

    this.activeVoices++;
    source.onended = (): void => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      envelope.disconnect();
    };

    source.start(startAt);
    source.stop(startAt + duration + 0.02);
  }

  /** Distance attenuation. Unpositioned sounds (UI) always play at full gain. */
  private gainForPosition(options: PlayOptions): number {
    if (options.x === undefined || options.y === undefined) return 1;
    const distance = Math.hypot(options.x - this.listenerX, options.y - this.listenerY);
    if (distance >= MAX_DISTANCE) return 0;
    // Squared falloff reads as "far away" far better than linear does.
    const t = 1 - distance / MAX_DISTANCE;
    return t * t;
  }

  setAmbience(id: string | null): void {
    this.ambienceId = id;

    const ctx = this.ctx;
    const gain = this.ambienceGain;
    if (!ctx || !gain) return;

    if (id === null) {
      gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
      return;
    }

    const def = AMBIENCES[id];
    if (!def) return;

    if (!this.ambienceSource) this.startAmbience(ctx, gain);
    if (this.ambienceFilter) {
      // Cross-fade by moving the filter rather than by swapping the source:
      // one continuous noise floor, re-coloured. Cheaper, and no seam.
      this.ambienceFilter.frequency.setTargetAtTime(def.filterHz, ctx.currentTime, 1.2);
    }
    gain.gain.setTargetAtTime(def.gain, ctx.currentTime, 1.2);
  }

  private startAmbience(ctx: AudioContext, output: GainNode): void {
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 0.7;

    // A slow drift on the cutoff. Without it the bed is a drone, and a drone is
    // the first thing a player mutes.
    const drift = ctx.createOscillator();
    drift.frequency.value = 1 / 21;
    const driftAmount = ctx.createGain();
    driftAmount.gain.value = 90;
    drift.connect(driftAmount);
    driftAmount.connect(filter.frequency);
    drift.start();

    source.connect(filter);
    filter.connect(output);
    source.start();

    this.ambienceSource = source;
    this.ambienceFilter = filter;
  }

  setListener(x: number, y: number): void {
    this.listenerX = x;
    this.listenerY = y;
  }

  setMasterVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  suspend(): void {
    void this.ctx?.suspend().catch(() => {
      /* nothing to do */
    });
  }

  resume(): void {
    if (!this.unlocked) return;
    void this.ctx?.resume().catch(() => {
      /* nothing to do */
    });
  }

  /** One second of white noise, reused by every noise voice and the ambience. */
  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic, so two runs sound identical - and so nothing here reaches
    // for a random source the project has rules about (ADR-009).
    let seed = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }
}

/** The best audio this environment can produce. */
export function createAudio(): AudioService {
  const service = new WebAudioService();
  service.init();
  return service;
}
