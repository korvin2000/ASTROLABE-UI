import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { StudioSocket } from '../core/ws';
import { StudioItem } from '../core/model';
import { CampaignModel } from '../reducers/campaign-model';

/** Views refetched when stream items name them (the refresh matrix of Appendix A, coalesced to 250 ms). */
const REFRESH: Record<string, string[]> = {
  'campaign.opened': ['contract', 'state'],
  'campaign.shape_selected': ['state', 'contract'],
  'campaign.increment_selected': ['state', 'ledger'],
  'campaign.increment_closed': ['state', 'ledger', 'contract', 'checks'],
  'campaign.finished': ['state', 'ledger', 'contract', 'checks', 'finish', 'budget', 'changes'],
  'contract.amended': ['contract', 'state'],
  'contract.amendment_proposed': ['contract'],
  'contract.amendment_resolved': ['contract'],
  'cell.started': ['cells', 'state'],
  'cell.ended': ['cells', 'state', 'budget'],
  'cell.register_patched': ['register'],
  'cell.model_responded': ['budget'],
  'journal.check': ['checks'],
  'journal.edit-outcome': ['changes'],
  'journal.boundary': [],
  'studio.run_ended': ['state', 'ledger', 'checks', 'finish', 'budget', 'changes', 'cells'],
  'studio.opened': ['contract', 'state', 'cells'],
  'studio.resync': ['contract', 'state', 'ledger', 'checks', 'finish', 'budget', 'changes', 'cells', 'register'],
};

/**
 * One store per open campaign (§32.1): the normalized stream applied through the pure reducer, batched per
 * animation frame (R-THR-05), plus lazily fetched views invalidated by the items that change them.
 */
export class CampaignStore {
  readonly model: CampaignModel;
  readonly version = signal(0);
  readonly loaded = signal(false);
  readonly contract = signal<any>(null);
  readonly state = signal<any>(null);
  readonly ledger = signal<any>(null);
  readonly checks = signal<any>(null);
  readonly finish = signal<any>(null);
  readonly budget = signal<any>(null);
  readonly changes = signal<any>(null);
  readonly cells = signal<any[]>([]);
  readonly register = signal<any>(null);
  readonly registerContext = signal<string | null>(null);
  /** Items applied since the last frame, for the Overview's animation layer (ephemeral, regenerated in replay). */
  readonly fresh = signal<StudioItem[]>([]);

  private queue: StudioItem[] = [];
  private frame = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private dirty = new Set<string>();
  private refreshTimer: any = null;
  private budgetTimer: any = null;

  constructor(readonly work: string, private readonly api: Api, private readonly socket: StudioSocket) {
    this.model = new CampaignModel(work);
  }

  async open(): Promise<void> {
    if (this.unsubscribe) return;
    // Backfill then live (§32.3): REST pages from the durable log, then the topic from the last applied seq.
    let after = 0;
    for (let page = 0; page < 50; page++) {
      const items = await this.api.get<StudioItem[]>(`/campaigns/${this.work}/events?after=${after}&limit=2000`);
      for (const i of items) this.model.apply(i);
      if (items.length < 2000) break;
      after = items[items.length - 1].seq ?? after;
    }
    this.version.update(v => v + 1);
    this.loaded.set(true);
    this.unsubscribe = this.socket.subscribe('campaign:' + this.work, (item: StudioItem) => this.enqueue(item), this.model.lastSeq);
    this.invalidate(['contract', 'state', 'ledger', 'checks', 'finish', 'budget', 'changes', 'cells', 'register']);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.cancelFlush();
  }

  private cancelFlush(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    if (this.timer) clearTimeout(this.timer);
    this.frame = 0;
    this.timer = null;
  }

  private enqueue(item: StudioItem): void {
    this.queue.push(item);
    if (this.frame || this.timer) return;
    // Batched per animation frame (R-THR-05). Hidden or occluded pages get no frames, so a short timer backs the
    // frame up; whichever fires first applies the batch.
    this.frame = requestAnimationFrame(() => this.flush());
    this.timer = setTimeout(() => this.flush(), 200);
  }

  private flush(): void {
    this.cancelFlush();
    const batch = this.queue;
    this.queue = [];
    const applied: StudioItem[] = [];
    const views = new Set<string>();
    for (const item of batch) {
      const before = this.model.lastSeq;
      this.model.apply(item);
      if (item.seq === undefined || item.seq > before) {
        applied.push(item);
        for (const v of REFRESH[item.kind] ?? []) views.add(v);
      }
    }
    if (!applied.length) return;
    this.version.update(v => v + 1);
    this.fresh.set(applied);
    if (views.size) this.invalidate([...views]);
  }

  /** Marks views stale and refetches them (coalesced; budget at most once per second). */
  invalidate(views: string[]): void {
    for (const v of views) {
      if (v === 'budget') {
        if (!this.budgetTimer) this.budgetTimer = setTimeout(() => { this.budgetTimer = null; this.fetch('budget'); }, 1000);
        continue;
      }
      this.dirty.add(v);
    }
    if (!this.refreshTimer && this.dirty.size) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        const list = [...this.dirty];
        this.dirty.clear();
        list.forEach(v => this.fetch(v));
      }, 250);
    }
  }

  async fetch(view: string): Promise<void> {
    const w = this.work;
    try {
      switch (view) {
        case 'contract': this.contract.set(await this.api.get(`/campaigns/${w}/contract`)); break;
        case 'state': this.state.set(await this.api.get(`/campaigns/${w}/state`)); break;
        case 'ledger': this.ledger.set(await this.api.get(`/campaigns/${w}/ledger`)); break;
        case 'checks': this.checks.set(await this.api.get(`/campaigns/${w}/checks`)); break;
        case 'finish': this.finish.set(await this.api.get(`/campaigns/${w}/finish-receipt`)); break;
        case 'budget': this.budget.set(await this.api.get(`/campaigns/${w}/budget`)); break;
        case 'changes': this.changes.set(await this.api.get(`/campaigns/${w}/changes`)); break;
        case 'cells': this.cells.set(await this.api.get(`/campaigns/${w}/cells`)); break;
        case 'register': {
          const ctx = this.registerContext() ?? this.model.activeCell()?.id ?? null;
          if (ctx) this.register.set(await this.api.get(`/campaigns/${w}/register/${ctx}`));
          break;
        }
      }
    } catch { /* a view that cannot be read stays as last synchronized */ }
  }

  selectRegister(context: string | null): void {
    this.registerContext.set(context);
    this.fetch('register');
  }
}

/** Keeps a few campaign stores alive across navigation (LRU of 6). */
@Injectable({ providedIn: 'root' })
export class CampaignStores {
  private readonly api = inject(Api);
  private readonly socket = inject(StudioSocket);
  private readonly stores = new Map<string, CampaignStore>();

  get(work: string): CampaignStore {
    let s = this.stores.get(work);
    if (s) {
      this.stores.delete(work);
      this.stores.set(work, s);
      return s;
    }
    s = new CampaignStore(work, this.api, this.socket);
    this.stores.set(work, s);
    s.open();
    while (this.stores.size > 6) {
      const oldest = this.stores.keys().next().value as string;
      this.stores.get(oldest)?.close();
      this.stores.delete(oldest);
    }
    return s;
  }
}
