// The parts of Konva the editor uses: the core (stage, layers, groups, drag and drop) and nine shapes. Importing
// 'konva' itself would also bundle filters, animations and shapes that are never drawn.
import Konva from 'konva/lib/Core';

export { Arc } from 'konva/lib/shapes/Arc';
export { Circle } from 'konva/lib/shapes/Circle';
export { Image as KonvaImage } from 'konva/lib/shapes/Image';
export { Line } from 'konva/lib/shapes/Line';
export { Path } from 'konva/lib/shapes/Path';
export { Rect } from 'konva/lib/shapes/Rect';
export type { RectConfig } from 'konva/lib/shapes/Rect';
export { Star } from 'konva/lib/shapes/Star';
export { Text as KonvaText } from 'konva/lib/shapes/Text';
export { TextPath } from 'konva/lib/shapes/TextPath';
export { Transformer } from 'konva/lib/shapes/Transformer';
export default Konva;
