import { MAX_STICKERS, Sticker, StickerGeometry, clampSticker } from './sticker.model';

/** Every change to the stickers goes through a command: one user action, one state change. */
export type StickerCommand =
  | { readonly type: 'add'; readonly sticker: Sticker }
  | { readonly type: 'update'; readonly id: string; readonly changes: Partial<StickerGeometry> }
  | { readonly type: 'remove'; readonly id: string };

export function applyStickerCommand(
  stickers: readonly Sticker[],
  command: StickerCommand,
): readonly Sticker[] {
  switch (command.type) {
    case 'add':
      return stickers.length < MAX_STICKERS && !stickers.some((s) => s.id === command.sticker.id)
        ? [...stickers, clampSticker(command.sticker)]
        : stickers;
    case 'update':
      return stickers.map((s) =>
        s.id === command.id ? clampSticker({ ...s, ...command.changes }) : s,
      );
    case 'remove':
      return stickers.filter((s) => s.id !== command.id);
    default:
      return unknownCommand(command);
  }
}

const MOVE_STEP = 0.01;
const MOVE_STEP_LARGE = 0.05;
const SCALE_STEP = 1.1;
const ROTATE_STEP = 15;

/**
 * Keyboard control of the selected sticker, or null if the key is not used. Keys with Ctrl, Cmd or Alt are left
 * to the browser (e.g. Ctrl+R reloads the page).
 */
export function stickerKeyCommand(sticker: Sticker, event: KeyboardEvent): StickerCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return null;
  }
  const { id, x, y, size, rotation } = sticker;
  if (event.key === 'Delete' || event.key === 'Backspace') {
    return { type: 'remove', id };
  }
  const step = event.shiftKey ? MOVE_STEP_LARGE : MOVE_STEP;
  const changes: Record<string, Partial<StickerGeometry>> = {
    ArrowLeft: { x: x - step },
    ArrowRight: { x: x + step },
    ArrowUp: { y: y - step },
    ArrowDown: { y: y + step },
    '+': { size: size * SCALE_STEP },
    '=': { size: size * SCALE_STEP },
    '-': { size: size / SCALE_STEP },
    r: { rotation: rotation + ROTATE_STEP },
    R: { rotation: rotation - ROTATE_STEP },
  };
  const change = changes[event.key];
  return change ? { type: 'update', id, changes: change } : null;
}

function unknownCommand(command: never): never {
  throw new Error(`Unknown sticker command: ${JSON.stringify(command)}`);
}
