import {
  ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, model, signal, untracked,
} from '@angular/core';
import { Hsv, hexToHsv, hsvToHex, normalizeHex } from './color-utils';

let nextId = 0;

/** Swatches plus a custom colour panel. */
@Component({
  selector: 'app-color-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(keydown.escape)': 'close(true)',
  },
  templateUrl: './color-picker.component.html',
  styleUrl: './color-picker.component.scss',
})
export class ColorPickerComponent {
  readonly value = model('#000000');
  readonly swatches = input<readonly string[]>([]);
  readonly label = input('');
  readonly customLabel = input('Custom colour');
  readonly areaLabel = input('Saturation and brightness');
  readonly hueLabel = input('Hue');
  readonly hexLabel = input('Hex colour');
  readonly doneLabel = input('OK');
  /** hex -> accessible name, falls back to the hex value */
  readonly colorNames = input<Readonly<Record<string, string>>>({});

  protected readonly id = `cp-${nextId++}`;
  protected readonly open = signal(false);
  // separate from value, otherwise the hue is lost for greys
  protected readonly hsv = signal<Hsv>({ h: 0, s: 0, v: 0 });
  protected readonly hexDraft = signal('#000000');
  protected readonly hexInvalid = signal(false);
  protected readonly isCustom = computed(() => !this.swatches().includes(this.value()));
  protected readonly hueColor = computed(() => `hsl(${this.hsv().h} 100% 50%)`);
  protected readonly saturationPercent = computed(() => Math.round(this.hsv().s * 100));
  protected dragging = false;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      const value = this.value();
      if (hsvToHex(untracked(this.hsv)) !== value) {
        this.hsv.set(hexToHsv(value));
      }
      this.hexDraft.set(value);
      this.hexInvalid.set(false);
    });
  }

  protected colorName(color: string): string {
    const names = this.colorNames();
    return Object.prototype.hasOwnProperty.call(names, color) ? names[color] : color;
  }

  protected pick(color: string): void {
    this.value.set(color);
    this.open.set(false);
  }

  protected toggle(): void {
    this.open.update(o => !o);
  }

  close(restoreFocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (restoreFocus) {
      this.host.nativeElement.querySelector<HTMLElement>('.cp-custom')?.focus();
    }
  }

  protected setHsv(change: Partial<Hsv>): void {
    const next = { ...this.hsv(), ...change };
    this.hsv.set(next);
    this.value.set(hsvToHex(next));
  }

  protected onAreaDown(event: PointerEvent, area: HTMLElement): void {
    if (!event.isPrimary || event.button !== 0) {
      return;
    }
    area.setPointerCapture(event.pointerId);
    area.focus();
    this.dragging = true;
    this.setFromPointer(event, area);
  }

  protected onAreaMove(event: PointerEvent, area: HTMLElement): void {
    if (this.dragging) {
      this.setFromPointer(event, area);
    }
  }

  protected onAreaKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 0.1 : 0.02;
    const { s, v } = this.hsv();
    const keys: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: Math.max(0, s - step) },
      ArrowRight: { s: Math.min(1, s + step) },
      ArrowUp: { v: Math.min(1, v + step) },
      ArrowDown: { v: Math.max(0, v - step) },
    };
    const change = keys[event.key];
    if (change) {
      event.preventDefault();
      this.setHsv(change);
    }
  }

  protected onHexInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value;
    this.hexDraft.set(text);
    const hex = normalizeHex(text);
    this.hexInvalid.set(hex === null);
    if (hex) {
      this.hsv.set(hexToHsv(hex));
      this.value.set(hex);
    }
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  private setFromPointer(event: PointerEvent, area: HTMLElement): void {
    const rect = area.getBoundingClientRect();
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height));
    this.setHsv({ s, v });
  }
}
