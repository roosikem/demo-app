import { deepFreeze } from '../models/freeze';

// Default (English) texts, override via options.labels
export interface FrameLabels {
  readonly expandWindow: string;
  readonly photo: string;
  readonly zoom: string;
  readonly rotation: string;
  readonly rotateLeft: string;
  readonly rotateRight: string;
  readonly reset: string;
  readonly dragHint: string;
  readonly tabsLabel: string;
  readonly tabCustom: string;
  readonly tabStencils: string;
  readonly ringStyle: string;
  readonly styleSolid: string;
  readonly styleGradient: string;
  readonly styleSegments: string;
  readonly ringColor: string;
  readonly customColor: string;
  readonly palette: string;
  readonly ringWidth: string;
  readonly innerLine: string;
  readonly font: string;
  readonly topText: string;
  readonly bottomText: string;
  readonly textColor: string;
  readonly lowContrast: string;
  readonly badge: string;
  readonly badgeNone: string;
  readonly badgeBubble: string;
  readonly badgeDiagonal: string;
  readonly badgeLine1: string;
  readonly badgeLine2: string;
  readonly badgeColor: string;
  readonly badgeTextColor: string;
  readonly badgeIcon: string;
  readonly resetFrame: string;
  readonly preview: string;
  readonly previewHint: string;
  /** Screen readers announce the preview with this name instead of "application". */
  readonly previewRole: string;
  readonly smallPreview: string;
  readonly format: string;
  readonly download: string;
  readonly showInPhoto: string;
  readonly resetPhotoView: string;
  readonly loadError: string;
  readonly noPhoto: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly photoAdjust: string;
  readonly dragHintShort: string;
  readonly noPhotoTitle: string;
  readonly sectionRing: string;
  readonly sectionText: string;
  readonly topColor: string;
  readonly bottomColor: string;
  readonly badgeType: string;
  readonly shownStatus: string;
  readonly selected: string;
  readonly searchStencils: string;
  readonly allCategories: string;
  /** {n} = shown, {total} = all */
  readonly resultCount: string;
  readonly jumpToStencil: string;
  readonly selectedPinned: string;
  readonly showSelected: string;
  /** {q} = search text */
  readonly noMatch: string;
  readonly clearSearch: string;
  readonly categoriesLabel: string;
  readonly colorArea: string;
  readonly colorHue: string;
  readonly colorHex: string;
  readonly colorDone: string;
  readonly iconNone: string;
  readonly iconCheck: string;
  readonly iconStar: string;
  readonly iconHeart: string;
  readonly iconCloud: string;
}

export const DEFAULT_LABELS: FrameLabels = deepFreeze({
  expandWindow: 'Please expand this window to choose your FaceFrame.',
  photo: 'Photo',
  zoom: 'Zoom',
  rotation: 'Rotation',
  rotateLeft: 'Rotate left 90°',
  rotateRight: 'Rotate right 90°',
  reset: 'Reset photo',
  dragHint: 'Tip: drag the photo to move it, scroll to zoom, or use the arrow keys.',
  tabsLabel: 'Frame type',
  tabCustom: 'Customized circle',
  tabStencils: 'Premade stencils',
  ringStyle: 'Ring style',
  styleSolid: 'Solid',
  styleGradient: 'Gradient',
  styleSegments: 'Multicolour',
  ringColor: 'Ring colour',
  customColor: 'Pick any colour',
  palette: 'Colours',
  ringWidth: 'Ring width',
  innerLine: 'White inner line',
  font: 'Font',
  topText: 'Text on top',
  bottomText: 'Text at bottom',
  textColor: 'Text colour',
  lowContrast: 'This text may be hard to read on the ring colour.',
  badge: 'Badge',
  badgeNone: 'None',
  badgeBubble: 'Round badge',
  badgeDiagonal: 'Diagonal',
  badgeLine1: 'Badge line 1',
  badgeLine2: 'Badge line 2',
  badgeColor: 'Badge colour',
  badgeTextColor: 'Badge text colour',
  badgeIcon: 'Icon',
  resetFrame: 'Reset frame',
  preview: 'Framed photo preview',
  previewHint: 'Preview of your framed profile photo',
  previewRole: 'photo preview',
  smallPreview: 'As shown in chats',
  format: 'Download format',
  download: 'Download image',
  showInPhoto: 'Show in my photo',
  resetPhotoView: 'Reset to original photo',
  loadError: 'The photo could not be loaded.',
  noPhoto: 'Choose a photo first.',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  photoAdjust: 'Adjust photo',
  dragHintShort: 'Drag to move · Scroll to zoom · Arrow keys to nudge',
  noPhotoTitle: 'No photo yet',
  sectionRing: 'Ring',
  sectionText: 'Text on ring',
  topColor: 'Top text colour',
  bottomColor: 'Bottom text colour',
  badgeType: 'Badge type',
  shownStatus: 'Shown in your photo',
  selected: 'Selected',
  searchStencils: 'Search stencils',
  allCategories: 'All',
  resultCount: '{n} of {total}',
  jumpToStencil: 'Jump to stencil',
  selectedPinned: 'Selected:',
  showSelected: 'Show',
  noMatch: 'No stencils match “{q}”',
  clearSearch: 'Clear search',
  categoriesLabel: 'Categories',
  colorArea: 'Saturation and brightness',
  colorHue: 'Hue',
  colorHex: 'Hex colour',
  colorDone: 'OK',
  iconNone: 'None',
  iconCheck: 'Check mark',
  iconStar: 'Star',
  iconHeart: 'Heart',
  iconCloud: 'Cloud',
});
