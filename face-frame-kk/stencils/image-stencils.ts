import { Stencil } from '../models/frame.model';
import { BG, WHITE } from './colors';

// Example image stencils: 1024x1024, transparent center, frame inside a radius of 504 px.
// baseUrl e.g. 'assets/face-frame/stencils'
export function imageStencils(baseUrl: string): Stencil[] {
  const url = (file: string): string => `${baseUrl.replace(/\/$/, '')}/${file}`;
  return [
    {
      id: 'image-laurel',
      category: 'Artwork',
      label: 'Laurel',
      tags: ['award', 'gold'],
      config: {
        image: url('laurel.png'),
        ring: null,
        texts: [
          {
            text: 'Well done',
            color: WHITE,
            center: 0,
            direction: 'cw',
            maxSpan: 70,
            fontWeight: 800,
          },
        ],
        photoClip: 'outer',
        photoBackground: BG,
      },
    },
    {
      id: 'image-confetti',
      category: 'Artwork',
      label: 'Confetti party',
      tags: ['party', 'celebration'],
      config: {
        image: url('confetti.png'),
        ring: null,
        texts: [],
        photoClip: 'outer',
        photoBackground: BG,
      },
    },
    {
      id: 'image-watercolour',
      category: 'Artwork',
      label: 'Watercolour',
      tags: ['paint', 'colourful'],
      config: {
        image: url('watercolour.png'),
        ring: null,
        texts: [
          {
            text: 'Hello!',
            color: WHITE,
            center: 180,
            direction: 'ccw',
            maxSpan: 60,
            fontWeight: 800,
          },
        ],
        photoClip: 'outer',
        photoBackground: BG,
      },
    },
    {
      id: 'image-star-ring',
      category: 'Artwork',
      label: 'Star ring',
      tags: ['stars', 'celebration', 'colourful'],
      config: {
        image: url('star-ring.png'),
        ring: null,
        // text is part of the image
        texts: [],
        photoClip: 'outer',
        photoBackground: BG,
      },
    },
  ];
}
