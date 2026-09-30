import { FlowNode } from '../../../timeline/steps';
import { COLOURS } from './flow-layout';
import { FlowMessage, Tone } from './flow-model';
import { LineId, lineBetween } from './flow-route';

// Flow motion (Studio 2 section 8.2.6): a bright segment travels a line in the direction of the message, the line
// glows while in use, the port answers on arrival. Only `opacity`, `transform` and `stroke-dashoffset` are animated.

/** A travelling segment is this long, in pixels, and at most 40 % of its line. */
export const SEGMENT = 56;
/** Pixels per millisecond. */
export const SPEED = 0.62;
export const MIN_TRAVEL_MS = 420;
/** At most one travelling segment per line in this time; a burst keeps the line in use and sends nothing more. */
export const COALESCE_MS = 400;
/** At most this many travelling segments on the canvas at once. */
export const CEILING = 8;
/** A line stays "in use" this long after its last message. */
export const LINE_OFF_MS = 1900;
export const EASING = 'cubic-bezier(.45,.05,.3,1)';

const NS = 'http://www.w3.org/2000/svg';
const TONES: Record<'ok' | 'bad', string> = { ok: '#34d399', bad: '#f87171' };

export function travelMs(length: number): number { return Math.max(MIN_TRAVEL_MS, length / SPEED); }

export function toneColour(from: FlowNode, tone: Tone): string { return tone ? TONES[tone] : COLOURS[from]; }

interface LineParts { group: SVGGElement; base: SVGPathElement; from: SVGCircleElement; to: SVGCircleElement; ringFrom: SVGCircleElement; ringTo: SVGCircleElement; }

/**
 * Plays messages on the lines of one canvas. It owns no state of the task: what it shows was put into it by
 * [play]; without a message nothing moves.
 */
export class FlowMotion {
  private readonly lastSent = new Map<LineId, number>();
  private readonly off = new Map<LineId, ReturnType<typeof setTimeout>>();
  private travelling = 0;
  private chain: Promise<void> = Promise.resolve();
  private lastTo: FlowNode | null = null;
  private stopped = false;

  constructor(private readonly svg: SVGSVGElement, private readonly still: () => boolean) { }

  private parts(id: LineId): LineParts | null {
    const group = this.svg.querySelector<SVGGElement>(`[data-line="${id}"]`);
    if (!group) return null;
    const q = <T extends Element>(s: string) => group.querySelector<T>(s)!;
    return { group, base: q<SVGPathElement>('.fe-base'), from: q<SVGCircleElement>('.fport.a'), to: q<SVGCircleElement>('.fport.b'), ringFrom: q<SVGCircleElement>('.fring.a'), ringTo: q<SVGCircleElement>('.fring.b') };
  }

  /** Queues [messages]; the hops of one round follow each other, unrelated messages start at once. */
  play(messages: FlowMessage[]): void {
    for (const m of messages) {
      const chained = this.lastTo === m.from;
      this.lastTo = m.to;
      if (chained) this.chain = this.chain.then(() => this.send(m));
      else this.chain = Promise.resolve(this.send(m));
    }
  }

  /** The line last used turns red for a moment (an error, Appendix D). */
  flash(m: FlowMessage): void {
    const found = lineBetween(m.from, m.to);
    const p = found && this.parts(found.line.id);
    if (!p) return;
    p.group.classList.add('bad');
    this.use(found!.line.id, p, found!.dir);
    setTimeout(() => p.group.classList.remove('bad'), LINE_OFF_MS);
  }

  private use(id: LineId, p: LineParts, dir: 1 | -1): void {
    p.group.classList.add('on');
    p.group.classList.toggle('rev', dir < 0);
    const timer = this.off.get(id);
    if (timer) clearTimeout(timer);
    this.off.set(id, setTimeout(() => p.group.classList.remove('on'), LINE_OFF_MS));
  }

  private arrive(p: LineParts, dir: 1 | -1): void {
    for (const el of dir > 0 ? [p.to, p.ringTo] : [p.from, p.ringFrom]) {
      el.classList.remove('hit');
      void el.getBoundingClientRect();
      el.classList.add('hit');
    }
  }

  private send(m: FlowMessage): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const found = lineBetween(m.from, m.to);
    const p = found && this.parts(found.line.id);
    if (!found || !p) return Promise.resolve();
    const id = found.line.id;
    this.use(id, p, found.dir);
    const now = performance.now();
    const recent = now - (this.lastSent.get(id) ?? -Infinity) < COALESCE_MS;
    if (this.still() || recent || this.travelling >= CEILING) {
      if (this.still()) this.arrive(p, found.dir);
      return new Promise(r => setTimeout(r, 120));
    }
    this.lastSent.set(id, now);
    const length = p.base.getTotalLength();
    if (!length) return Promise.resolve();
    const segment = Math.min(SEGMENT, length * 0.4);
    const comet = document.createElementNS(NS, 'path');
    comet.setAttribute('class', 'fe-comet');
    comet.setAttribute('d', p.base.getAttribute('d') ?? '');
    comet.style.setProperty('--c', toneColour(m.from, m.tone));
    comet.style.strokeDasharray = `${segment} ${length + segment}`;
    p.group.appendChild(comet);
    this.travelling++;
    const from = found.dir > 0 ? segment : -length, to = found.dir > 0 ? -length : segment;
    const animation = comet.animate([{ strokeDashoffset: from }, { strokeDashoffset: to }], { duration: travelMs(length), easing: EASING, fill: 'both' });
    return animation.finished.then(() => undefined, () => undefined).then(() => {
      comet.remove();
      this.travelling--;
      if (!this.stopped) this.arrive(p, found.dir);
    });
  }

  /** Lines draw themselves from start to end when the canvas first appears. */
  draw(): void {
    if (this.still()) return;
    this.svg.querySelectorAll<SVGPathElement>('.fe-base').forEach((path, i) => {
      const length = path.getTotalLength();
      if (!length) return;
      path.style.strokeDasharray = String(length);
      path.animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], { duration: 900, delay: 250 + i * 90, easing: 'ease-out', fill: 'backwards' })
        .finished.then(() => { path.style.strokeDasharray = ''; }, () => { path.style.strokeDasharray = ''; });
    });
  }

  /** Ends every motion: the panel closed, the tab is hidden or the task no longer works. */
  rest(): void {
    this.svg.querySelectorAll('.fe-comet').forEach(c => c.remove());
    this.svg.querySelectorAll('.fedge.on').forEach(g => g.classList.remove('on'));
    this.off.forEach(t => clearTimeout(t));
    this.off.clear();
    this.travelling = 0;
    this.lastTo = null;
    this.chain = Promise.resolve();
  }

  stop(): void {
    this.stopped = true;
    this.rest();
  }
}
