import { Signal } from '@angular/core';
import { FaceFrameError, FaceFrameOptions } from '../config/face-frame-options';
import { FaceFrameState } from '../config/face-frame-state';
import { FrameLabels } from '../config/frame-labels';
import { CustomFrameState } from '../rendering/custom-frame';

// The editor component is split into parts (stickers, badge, texts, stencil finder, ...). This is what every part
// gets from the component: the current options and state, and the actions to change them.

export type Tab = FaceFrameState['tab'];

/** Things on the preview that can be selected. Only one is selected at a time. */
export type Selectable = 'sticker' | 'badge' | 'text';

export interface EditorContext {
  readonly opts: Signal<FaceFrameOptions>;
  readonly labels: Signal<FrameLabels>;
  readonly tab: Signal<Tab>;
  readonly state: Signal<FaceFrameState>;
  update(change: Partial<FaceFrameState>): void;
  replaceState(next: FaceFrameState): void;
  /** changes the customized circle */
  patch(change: Partial<CustomFrameState>): void;
  /** a part got selected: all other parts drop their selection */
  claimSelection(part: Selectable): void;
  focusPreview(): void;
  /** focuses `${uid}-${suffix}` after the next render (e.g. a button that appears) */
  focusLater(suffix: string): void;
  reportError(error: FaceFrameError): void;
}
