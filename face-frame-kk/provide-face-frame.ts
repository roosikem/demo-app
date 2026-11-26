// Light entry for app.config.ts: provideFaceFrame and the option types without the editor, so the editor and
// Konva stay out of the first download when the host page loads the editor with @defer.
export { provideFaceFrame } from './config/face-frame-options';
export type { FaceFrameOptions, FaceFrameOptionsInput } from './config/face-frame-options';
