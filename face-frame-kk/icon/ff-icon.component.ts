import { ChangeDetectionStrategy, Component, input } from '@angular/core';

// Small inline SVG icons used by the editor buttons.

export type FfIconName =
  | 'zoom-in'
  | 'zoom-out'
  | 'rotate-left'
  | 'rotate-right'
  | 'reset'
  | 'download'
  | 'show'
  | 'chevron'
  | 'check'
  | 'move'
  | 'move-badge'
  | 'move-top-text'
  | 'move-bottom-text'
  | 'reset-positions'
  | 'warn'
  | 'info'
  | 'user'
  | 'plus';

@Component({
  selector: 'app-ff-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ff-icon.component', 'aria-hidden': 'true' },
  templateUrl: './ff-icon.component.html',
  styleUrl: './ff-icon.component.scss',
})
export class FfIconComponent {
  readonly name = input.required<FfIconName>();
  readonly size = input(18);
}
