import { computed, signal } from '@angular/core';
import { Stencil } from '../models/frame.model';
import { EditorContext } from './editor-context';

// Finding a premade stencil: the search box, the category chips, the dropdown and the arrow keys in the gallery.

const SEARCH_MAX_LENGTH = 64;
/** gap between the stencil cards in px, as in face-frame-gallery.scss */
const CARD_GAP = 12;

export interface StencilFinderHost {
  select(id: string): void;
  scrollTo(id: string, focus: boolean): void;
}

export class StencilFinder {
  readonly searchMaxLength = SEARCH_MAX_LENGTH;
  readonly query = signal('');
  readonly category = signal<string | null>(null);
  readonly categories = computed(() => {
    const seen: string[] = [];
    for (const s of this.stencils()) {
      if (s.category && !seen.includes(s.category)) {
        seen.push(s.category);
      }
    }
    return seen;
  });
  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    const category = this.category();
    const translate = this.editor.opts().translate;
    return this.stencils().filter(
      (s) => (!category || s.category === category) && (!q || searchText(s, translate).includes(q)),
    );
  });
  /** for the dropdown; stencils without a category go last, without an optgroup */
  readonly groups = computed(() => {
    const groups = this.categories().map((category) => ({
      category,
      stencils: this.stencils().filter((s) => s.category === category),
    }));
    const rest = this.stencils().filter((s) => !s.category);
    return rest.length ? [...groups, { category: '', stencils: rest }] : groups;
  });
  readonly selected = computed(() => this.stencils().find((s) => s.id === this.selectedId()));
  /** the selected stencil is hidden by the search or the category */
  readonly selectedHidden = computed(
    () => !!this.selected() && !this.visible().some((s) => s.id === this.selectedId()),
  );
  /** roving tabindex: only one card is in the tab order */
  readonly focusableId = computed(() =>
    this.selectedHidden() ? this.visible()[0]?.id : this.selectedId(),
  );
  readonly resultText = computed(() => {
    const count = this.editor
      .labels()
      .resultCount.replace('{n}', String(this.visible().length))
      .replace('{total}', String(this.stencils().length));
    const category = this.category();
    return category ? `${count} · ${this.editor.opts().translate(category)}` : count;
  });
  readonly noMatchText = computed(() =>
    this.editor.labels().noMatch.replace('{q}', this.query().trim()),
  );

  private readonly stencils = computed(() => this.editor.opts().stencils);
  private readonly selectedId = computed(() => this.editor.state().stencilId);

  constructor(
    private readonly editor: EditorContext,
    private readonly host: StencilFinderHost,
  ) {}

  setQuery(value: string): void {
    this.query.set(value.slice(0, SEARCH_MAX_LENGTH));
  }

  /** null: all categories */
  setCategory(category: string | null): void {
    this.category.set(category);
  }

  clear(): void {
    this.query.set('');
    this.category.set(null);
  }

  /** from the dropdown: the stencil is shown even when the filters hide it */
  jumpTo(id: string): void {
    this.host.select(id);
    if (this.selectedHidden()) {
      this.clear();
    }
    this.host.scrollTo(id, false);
  }

  showSelected(): void {
    this.clear();
    this.host.scrollTo(this.selectedId(), true);
  }

  /** arrow keys, Home and End in the gallery grid */
  onGalleryKey(event: KeyboardEvent): void {
    const list = this.visible();
    if (!list.length) {
      return;
    }
    const gallery = event.currentTarget as HTMLElement;
    const card = gallery.querySelector<HTMLElement>('.ff-stencil');
    const columns = card
      ? Math.max(1, Math.round(gallery.clientWidth / (card.offsetWidth + CARD_GAP)))
      : 1;
    const current = Math.max(
      0,
      list.findIndex((s) => s.id === this.focusableId()),
    );
    const moves: Readonly<Record<string, number>> = {
      ArrowRight: current + 1,
      ArrowLeft: current - 1,
      ArrowDown: current + columns,
      ArrowUp: current - columns,
      Home: 0,
      End: list.length - 1,
    };
    const next = moves[event.key];
    if (next === undefined) {
      return;
    }
    event.preventDefault();
    const target = list[Math.min(list.length - 1, Math.max(0, next))];
    this.host.select(target.id);
    this.host.scrollTo(target.id, true);
  }
}

function searchText(s: Stencil, translate: (text: string) => string): string {
  const c = s.config;
  const badge = c.badge
    ? [...c.badge.lines, c.badge.shape === 'diagonal' ? c.badge.title : '']
    : [];
  const words = [
    s.label,
    s.category ?? '',
    ...(s.tags ?? []),
    ...c.texts.map((t) => t.text),
    ...badge,
  ];
  return [...words, ...words.map(translate)].join(' ').toLowerCase();
}
