import { FrameConfig, Stencil } from '../models/frame.model';
import {
  BG,
  BLUE,
  BROWN,
  CORAL,
  DEEP_MINT,
  DEEP_SEA,
  FOREST,
  GREEN,
  GREEN_DARK,
  INK,
  LIME,
  MINT,
  NAVY,
  ORANGE,
  PINK,
  PURPLE,
  SKY,
  SLATE,
  TEAL,
  VIOLET,
  WHITE,
  YELLOW,
} from './colors';
import { deepFreeze } from '../models/freeze';

// Additional stencils, grouped by category

function frame(
  partial: Omit<FrameConfig, 'photoBackground' | 'photoClip'> & {
    photoClip?: FrameConfig['photoClip'];
  },
): FrameConfig {
  return { photoClip: 'inner', photoBackground: BG, ...partial };
}

export const STENCIL_LIBRARY: readonly Stencil[] = deepFreeze([
  // Classic
  {
    id: 'navy-line',
    label: 'Navy line',
    category: 'Classic',
    tags: ['hello', 'welcome'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: NAVY },
        width: 0.18,
        innerLine: { color: WHITE, width: 0.02 },
      },
      texts: [
        { text: 'Hello', color: WHITE, center: 0, direction: 'cw', maxSpan: 90 },
        { text: 'Nice to meet you', color: WHITE, center: 180, direction: 'ccw', maxSpan: 150 },
      ],
    }),
  },
  {
    id: 'charcoal-serif',
    label: 'Charcoal serif',
    category: 'Classic',
    tags: ['serif', 'elegant'],
    config: frame({
      ring: { fill: { type: 'solid', color: '#2b2f36' }, width: 0.2 },
      texts: [
        {
          text: 'Classic',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 100,
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
        },
        {
          text: 'Since day one',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 140,
          fontFamily: 'Georgia, serif',
          fontWeight: 700,
        },
      ],
      decorations: [
        { symbol: '•', angle: 90, color: WHITE },
        { symbol: '•', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'teal-band',
    label: 'Teal band',
    category: 'Classic',
    tags: ['hello'],
    config: frame({
      ring: { fill: { type: 'solid', color: TEAL }, width: 0.16 },
      texts: [
        {
          text: 'Say hello',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '◇', angle: 150, color: WHITE },
        { symbol: '◇', angle: 180, color: WHITE },
        { symbol: '◇', angle: 210, color: WHITE },
      ],
    }),
  },
  {
    id: 'crimson-ribbon',
    label: 'Crimson ribbon',
    category: 'Classic',
    tags: ['welcome', 'red'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: '#8f1d2c' },
        width: 0.2,
        innerLine: { color: YELLOW, width: 0.015 },
      },
      texts: [
        { text: 'Welcome aboard', color: WHITE, center: 0, direction: 'cw', maxSpan: 150 },
        { text: 'Glad you are here', color: WHITE, center: 180, direction: 'ccw', maxSpan: 150 },
      ],
    }),
  },
  {
    id: 'royal-gold',
    label: 'Royal gold',
    category: 'Classic',
    tags: ['member', 'purple', 'star'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [PURPLE, VIOLET, PURPLE] }, width: 0.18 },
      texts: [
        {
          text: 'Member',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 90,
          fontWeight: 800,
          letterSpacing: 0.12,
        },
      ],
      decorations: [
        { symbol: '★', angle: 90, color: YELLOW },
        { symbol: '★', angle: 180, color: YELLOW },
        { symbol: '★', angle: 270, color: YELLOW },
      ],
    }),
  },
  {
    id: 'slate-diamonds',
    label: 'Slate diamonds',
    category: 'Classic',
    tags: ['grey', 'no text'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: SLATE },
        width: 0.12,
        innerLine: { color: WHITE, width: 0.015 },
      },
      texts: [],
      decorations: [
        { symbol: '◇', angle: 0, color: WHITE },
        { symbol: '◇', angle: 90, color: WHITE },
        { symbol: '◇', angle: 180, color: WHITE },
        { symbol: '◇', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'ivory-ring',
    label: 'Ivory ring',
    category: 'Classic',
    tags: ['light', 'hello'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: '#f4efe6' },
        width: 0.16,
        innerLine: { color: '#d8cfc0', width: 0.012 },
      },
      texts: [
        { text: 'Hello there', color: INK, center: 0, direction: 'cw', maxSpan: 120 },
        { text: 'Pleased to meet you', color: INK, center: 180, direction: 'ccw', maxSpan: 150 },
      ],
    }),
  },

  // Celebration
  {
    id: 'confetti',
    label: 'Confetti',
    category: 'Celebration',
    tags: ['party', 'colourful'],
    config: frame({
      ring: {
        fill: {
          type: 'segments',
          colors: [CORAL, YELLOW, GREEN, BLUE, VIOLET, CORAL, YELLOW, GREEN, BLUE, VIOLET],
        },
        width: 0.18,
      },
      texts: [
        {
          text: 'Hooray!',
          color: INK,
          center: 180,
          direction: 'ccw',
          maxSpan: 90,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '★', angle: 0, color: WHITE },
        { symbol: '×', angle: 45, color: WHITE },
        { symbol: '×', angle: 315, color: WHITE },
      ],
    }),
  },
  {
    id: 'birthday',
    label: 'Birthday',
    category: 'Celebration',
    tags: ['birthday', 'pink', 'hearts'],
    config: frame({
      ring: { fill: { type: 'solid', color: PINK }, width: 0.18 },
      texts: [
        {
          text: 'Happy birthday',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 150,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '♥', angle: 150, color: WHITE },
        { symbol: '♥', angle: 180, color: WHITE },
        { symbol: '♥', angle: 210, color: WHITE },
      ],
    }),
  },
  {
    id: 'five-years',
    label: '5 years',
    category: 'Celebration',
    tags: ['anniversary', 'years', 'arc'],
    config: frame({
      ring: {
        fill: { type: 'gradient', colors: [YELLOW, ORANGE, CORAL] },
        width: 0.16,
        arc: { start: 200, end: 470 },
      },
      texts: [
        {
          text: '5 years',
          color: BROWN,
          center: 285,
          direction: 'cw',
          maxSpan: 70,
          fontWeight: 800,
        },
      ],
      photoClip: 'outer',
    }),
  },
  {
    id: 'cheers',
    label: 'Cheers',
    category: 'Celebration',
    tags: ['yellow', 'team'],
    config: frame({
      ring: { fill: { type: 'solid', color: YELLOW }, width: 0.2 },
      texts: [
        { text: 'Cheers!', color: INK, center: 0, direction: 'cw', maxSpan: 90, fontWeight: 800 },
        { text: 'to the team', color: INK, center: 180, direction: 'ccw', maxSpan: 120 },
      ],
      decorations: [
        { symbol: '◇', angle: 90, color: ORANGE },
        { symbol: '◇', angle: 270, color: ORANGE },
      ],
    }),
  },
  {
    id: 'party-time',
    label: 'Party time',
    category: 'Celebration',
    tags: ['party', 'badge'],
    config: frame({
      ring: { fill: { type: 'solid', color: VIOLET }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: VIOLET,
        textColor: WHITE,
        lines: ['Party', 'time'],
        angle: 135,
        icon: 'star',
      },
    }),
  },
  {
    id: 'thank-you',
    label: 'Thank you',
    category: 'Celebration',
    tags: ['thanks', 'heart'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [CORAL, PINK, VIOLET, CORAL] }, width: 0.18 },
      texts: [
        {
          text: 'Thank you!',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 110,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '♥', angle: 0, color: WHITE }],
    }),
  },
  {
    id: 'well-done',
    label: 'Well done',
    category: 'Celebration',
    tags: ['green', 'praise'],
    config: frame({
      ring: {
        fill: { type: 'segments', colors: [GREEN, LIME, GREEN, LIME, GREEN, LIME, GREEN, LIME] },
        width: 0.18,
      },
      texts: [
        {
          text: 'Well done',
          color: FOREST,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '★', angle: 180, color: FOREST }],
    }),
  },
  {
    id: 'challenge-done',
    label: 'Challenge done',
    category: 'Celebration',
    tags: ['diagonal', 'win'],
    config: frame({
      ring: null,
      texts: [],
      badge: {
        shape: 'diagonal',
        color: '#0d0d1a',
        textColor: '#f4f4f4',
        title: 'WIN',
        titleColors: [YELLOW, CORAL, GREEN],
        lines: ['Challenge', 'complete'],
      },
      photoClip: 'outer',
    }),
  },

  // Team & Roles
  {
    id: 'team-lead',
    label: 'Team lead',
    category: 'Team & Roles',
    tags: ['lead', 'badge'],
    config: frame({
      ring: { fill: { type: 'solid', color: NAVY }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: NAVY,
        textColor: WHITE,
        lines: ['Team', 'lead'],
        angle: 135,
        icon: 'star',
      },
    }),
  },
  {
    id: 'new-joiner',
    label: 'New joiner',
    category: 'Team & Roles',
    tags: ['new', 'onboarding'],
    config: frame({
      ring: { fill: { type: 'solid', color: BLUE }, width: 0.18 },
      texts: [
        {
          text: 'New here',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
        {
          text: 'Say hi!',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 90,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '»', angle: 90, color: WHITE },
        { symbol: '«', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'volunteer',
    label: 'Volunteer',
    category: 'Team & Roles',
    tags: ['volunteer', 'badge', 'heart'],
    config: frame({
      ring: { fill: { type: 'solid', color: GREEN_DARK }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: GREEN_DARK,
        textColor: WHITE,
        lines: ['Volunteer'],
        angle: 225,
        icon: 'heart',
      },
    }),
  },
  {
    id: 'buddy',
    label: 'Your buddy',
    category: 'Team & Roles',
    tags: ['buddy', 'onboarding'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [TEAL, SKY, TEAL] }, width: 0.15 },
      texts: [
        {
          text: 'Your buddy',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 120,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '♥', angle: 180, color: WHITE }],
    }),
  },
  {
    id: 'organiser',
    label: 'Organiser',
    category: 'Team & Roles',
    tags: ['event', 'organiser'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: PURPLE },
        width: 0.18,
        innerLine: { color: WHITE, width: 0.02 },
      },
      texts: [
        { text: 'Organiser', color: WHITE, center: 0, direction: 'cw', maxSpan: 110 },
        { text: 'Ask me anything', color: WHITE, center: 180, direction: 'ccw', maxSpan: 150 },
      ],
    }),
  },
  {
    id: 'speaker',
    label: 'Speaker',
    category: 'Team & Roles',
    tags: ['speaker', 'diagonal', 'event'],
    config: frame({
      ring: null,
      texts: [],
      badge: {
        shape: 'diagonal',
        color: INK,
        textColor: '#f4f4f4',
        title: 'MIC',
        titleColors: [YELLOW],
        lines: ['Speaker', 'today'],
      },
      photoClip: 'outer',
    }),
  },
  {
    id: 'hiring',
    label: "We're hiring",
    category: 'Team & Roles',
    tags: ['hiring', 'recruiting'],
    config: frame({
      ring: { fill: { type: 'solid', color: TEAL }, width: 0.18 },
      texts: [
        {
          text: "We're hiring",
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 130,
          fontWeight: 800,
        },
        {
          text: 'Join us',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 90,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '»', angle: 90, color: WHITE },
        { symbol: '«', angle: 270, color: WHITE },
      ],
    }),
  },

  // Skills & Learning
  {
    id: 'always-learning',
    label: 'Always learning',
    category: 'Skills & Learning',
    tags: ['learning', 'badge'],
    config: frame({
      ring: { fill: { type: 'solid', color: BLUE }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: BLUE,
        textColor: WHITE,
        lines: ['Always', 'learning'],
        angle: 225,
        icon: 'cloud',
      },
    }),
  },
  {
    id: 'coach',
    label: 'Coach',
    category: 'Skills & Learning',
    tags: ['coach', 'badge'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: ['#f2b705', ORANGE, '#f2b705'] }, width: 0.16 },
      texts: [
        {
          text: 'Coach',
          color: BROWN,
          center: 0,
          direction: 'cw',
          maxSpan: 70,
          fontWeight: 800,
          letterSpacing: 0.1,
        },
      ],
      badge: {
        shape: 'bubble',
        color: NAVY,
        textColor: WHITE,
        lines: ['Book', 'me'],
        angle: 135,
        icon: 'check',
      },
    }),
  },
  {
    id: 'graduate',
    label: 'Graduate',
    category: 'Skills & Learning',
    tags: ['graduate', 'black', 'gold'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: INK },
        width: 0.18,
        innerLine: { color: YELLOW, width: 0.015 },
      },
      texts: [
        {
          text: 'Graduate',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
        { text: 'Keep growing', color: WHITE, center: 180, direction: 'ccw', maxSpan: 130 },
      ],
      decorations: [
        { symbol: '★', angle: 90, color: YELLOW },
        { symbol: '★', angle: 270, color: YELLOW },
      ],
    }),
  },
  {
    id: 'expert',
    label: 'Expert',
    category: 'Skills & Learning',
    tags: ['expert', 'diagonal'],
    config: frame({
      ring: null,
      texts: [],
      badge: {
        shape: 'diagonal',
        color: '#0d0d1a',
        textColor: '#f4f4f4',
        title: 'PRO',
        titleColors: [SKY, MINT],
        lines: ['Subject', 'expert'],
      },
      photoClip: 'outer',
    }),
  },
  {
    id: 'stay-curious',
    label: 'Stay curious',
    category: 'Skills & Learning',
    tags: ['curious', 'segments'],
    config: frame({
      ring: {
        fill: { type: 'segments', colors: [VIOLET, SKY, MINT, VIOLET, SKY, MINT] },
        width: 0.16,
      },
      texts: [
        {
          text: 'Stay curious',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 120,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '◇', angle: 0, color: WHITE }],
    }),
  },
  {
    id: 'workshop',
    label: 'Workshop',
    category: 'Skills & Learning',
    tags: ['workshop', 'orange'],
    config: frame({
      ring: { fill: { type: 'solid', color: ORANGE }, width: 0.18 },
      texts: [
        {
          text: 'Workshop',
          color: BROWN,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
        {
          text: 'Hands on',
          color: BROWN,
          center: 180,
          direction: 'ccw',
          maxSpan: 100,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '×', angle: 90, color: WHITE },
        { symbol: '×', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'book-club',
    label: 'Book club',
    category: 'Skills & Learning',
    tags: ['reading', 'arc'],
    config: frame({
      ring: {
        fill: { type: 'gradient', colors: [NAVY, BLUE] },
        width: 0.16,
        arc: { start: 230, end: 490 },
      },
      texts: [
        {
          text: 'Book club',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 110,
          fontWeight: 800,
        },
      ],
      photoClip: 'outer',
    }),
  },

  // Wellbeing
  {
    id: 'balance',
    label: 'Balance',
    category: 'Wellbeing',
    tags: ['balance', 'mint'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [MINT, LIME, MINT] }, width: 0.16 },
      texts: [
        {
          text: 'Balance',
          color: DEEP_MINT,
          center: 90,
          direction: 'cw',
          maxSpan: 90,
          fontWeight: 800,
          letterSpacing: 0.1,
        },
      ],
      decorations: [{ symbol: '•', angle: 270, color: DEEP_MINT }],
    }),
  },
  {
    id: 'breathe',
    label: 'Breathe',
    category: 'Wellbeing',
    tags: ['calm', 'sky'],
    config: frame({
      ring: { fill: { type: 'solid', color: SKY }, width: 0.18 },
      texts: [
        {
          text: 'Breathe',
          color: DEEP_SEA,
          center: 0,
          direction: 'cw',
          maxSpan: 100,
          fontWeight: 800,
          letterSpacing: 0.12,
        },
        { text: 'Take a moment', color: DEEP_SEA, center: 180, direction: 'ccw', maxSpan: 140 },
      ],
      decorations: [
        { symbol: '•', angle: 90, color: WHITE },
        { symbol: '•', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'walk-club',
    label: 'Walk club',
    category: 'Wellbeing',
    tags: ['walk', 'badge', 'green'],
    config: frame({
      ring: { fill: { type: 'solid', color: GREEN_DARK }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: GREEN_DARK,
        textColor: WHITE,
        lines: ['Walk', 'club'],
        angle: 225,
        icon: 'none',
      },
    }),
  },
  {
    id: 'be-kind',
    label: 'Be kind',
    category: 'Wellbeing',
    tags: ['kindness', 'hearts', 'pink'],
    config: frame({
      ring: { fill: { type: 'solid', color: PINK }, width: 0.18 },
      texts: [
        {
          text: 'Be kind',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 90,
          fontWeight: 800,
        },
      ],
      decorations: [
        { symbol: '♥', angle: 300, color: WHITE },
        { symbol: '♥', angle: 0, color: WHITE },
        { symbol: '♥', angle: 60, color: WHITE },
      ],
    }),
  },
  {
    id: 'focus-time',
    label: 'Focus time',
    category: 'Wellbeing',
    tags: ['focus', 'grey', 'status'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: SLATE },
        width: 0.16,
        innerLine: { color: WHITE, width: 0.015 },
      },
      texts: [
        { text: 'Focus time', color: WHITE, center: 0, direction: 'cw', maxSpan: 120 },
        { text: 'Back soon', color: WHITE, center: 180, direction: 'ccw', maxSpan: 110 },
      ],
    }),
  },
  {
    id: 'good-vibes',
    label: 'Good vibes',
    category: 'Wellbeing',
    tags: ['sunshine', 'yellow'],
    config: frame({
      ring: {
        fill: {
          type: 'segments',
          colors: [
            YELLOW,
            '#ffd980',
            YELLOW,
            '#ffd980',
            YELLOW,
            '#ffd980',
            YELLOW,
            '#ffd980',
            YELLOW,
            '#ffd980',
          ],
        },
        width: 0.16,
      },
      texts: [
        {
          text: 'Good vibes',
          color: BROWN,
          center: 0,
          direction: 'cw',
          maxSpan: 120,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '★', angle: 180, color: ORANGE }],
    }),
  },
  {
    id: 'fresh-air',
    label: 'Fresh air',
    category: 'Wellbeing',
    tags: ['outdoors', 'arc', 'green'],
    config: frame({
      ring: {
        fill: { type: 'gradient', colors: [GREEN, LIME] },
        width: 0.16,
        arc: { start: 150, end: 390 },
      },
      texts: [
        {
          text: 'Fresh air',
          color: FOREST,
          center: 270,
          direction: 'cw',
          maxSpan: 90,
          fontWeight: 800,
        },
      ],
      photoClip: 'outer',
    }),
  },

  // Seasons & Events
  {
    id: 'spring',
    label: 'Spring',
    category: 'Seasons & Events',
    tags: ['season', 'pastel'],
    config: frame({
      ring: {
        fill: {
          type: 'segments',
          colors: [LIME, '#f9a8c9', '#ffd980', LIME, '#f9a8c9', '#ffd980'],
        },
        width: 0.18,
      },
      texts: [
        {
          text: 'Hello spring',
          color: INK,
          center: 180,
          direction: 'ccw',
          maxSpan: 130,
          fontWeight: 800,
        },
      ],
      decorations: [{ symbol: '•', angle: 0, color: WHITE }],
    }),
  },
  {
    id: 'summer',
    label: 'Summer',
    category: 'Seasons & Events',
    tags: ['season', 'warm'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [YELLOW, ORANGE, CORAL, YELLOW] }, width: 0.18 },
      texts: [
        {
          text: 'Summer',
          color: BROWN,
          center: 0,
          direction: 'cw',
          maxSpan: 90,
          fontWeight: 800,
          letterSpacing: 0.12,
        },
      ],
      decorations: [{ symbol: '★', angle: 180, color: WHITE }],
    }),
  },
  {
    id: 'autumn',
    label: 'Autumn',
    category: 'Seasons & Events',
    tags: ['season', 'rust'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: '#a3461c' },
        width: 0.18,
        innerLine: { color: YELLOW, width: 0.015 },
      },
      texts: [
        {
          text: 'Autumn',
          color: WHITE,
          center: 0,
          direction: 'cw',
          maxSpan: 90,
          fontWeight: 800,
          letterSpacing: 0.12,
        },
      ],
      decorations: [
        { symbol: '◇', angle: 150, color: YELLOW },
        { symbol: '◇', angle: 180, color: YELLOW },
        { symbol: '◇', angle: 210, color: YELLOW },
      ],
    }),
  },
  {
    id: 'winter',
    label: 'Winter',
    category: 'Seasons & Events',
    tags: ['season', 'snow'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: NAVY },
        width: 0.18,
        innerLine: { color: SKY, width: 0.015 },
      },
      texts: [
        {
          text: 'Winter',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 90,
          fontWeight: 800,
          letterSpacing: 0.12,
        },
      ],
      decorations: [
        { symbol: '×', angle: 320, color: WHITE },
        { symbol: '×', angle: 0, color: WHITE },
        { symbol: '×', angle: 40, color: WHITE },
      ],
    }),
  },
  {
    id: 'new-year',
    label: 'New year',
    category: 'Seasons & Events',
    tags: ['new year', 'badge', 'gold'],
    config: frame({
      ring: { fill: { type: 'solid', color: INK }, width: 0.07 },
      texts: [],
      badge: {
        shape: 'bubble',
        color: INK,
        textColor: YELLOW,
        lines: ['New', 'year'],
        angle: 45,
        icon: 'star',
      },
    }),
  },
  {
    id: 'conference',
    label: 'Conference',
    category: 'Seasons & Events',
    tags: ['event', 'diagonal'],
    config: frame({
      ring: null,
      texts: [],
      badge: {
        shape: 'diagonal',
        color: NAVY,
        textColor: WHITE,
        title: 'LIVE',
        titleColors: [CORAL],
        lines: ['Conference', 'attendee'],
      },
      photoClip: 'outer',
    }),
  },
  {
    id: 'hack-night',
    label: 'Hack night',
    category: 'Seasons & Events',
    tags: ['event', 'arc', 'tech'],
    config: frame({
      ring: {
        fill: { type: 'gradient', colors: [VIOLET, SKY, MINT] },
        width: 0.16,
        arc: { start: 60, end: 300 },
      },
      texts: [
        {
          text: 'Hack night',
          color: WHITE,
          center: 180,
          direction: 'ccw',
          maxSpan: 110,
          fontWeight: 800,
        },
      ],
      photoClip: 'outer',
    }),
  },

  // Minimal
  {
    id: 'thin-navy',
    label: 'Thin navy',
    category: 'Minimal',
    tags: ['thin', 'no text'],
    config: frame({
      ring: { fill: { type: 'solid', color: NAVY }, width: 0.05 },
      texts: [],
    }),
  },
  {
    id: 'teal-dots',
    label: 'Teal dots',
    category: 'Minimal',
    tags: ['thin', 'dots'],
    config: frame({
      ring: { fill: { type: 'solid', color: TEAL }, width: 0.06 },
      texts: [],
      decorations: [
        { symbol: '•', angle: 0, color: WHITE },
        { symbol: '•', angle: 90, color: WHITE },
        { symbol: '•', angle: 180, color: WHITE },
        { symbol: '•', angle: 270, color: WHITE },
      ],
    }),
  },
  {
    id: 'gold-line',
    label: 'Gold line',
    category: 'Minimal',
    tags: ['thin', 'gold'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: '#c9a227' },
        width: 0.05,
        innerLine: { color: WHITE, width: 0.01 },
      },
      texts: [],
    }),
  },
  {
    id: 'ink-line',
    label: 'Ink line',
    category: 'Minimal',
    tags: ['black', 'double line'],
    config: frame({
      ring: {
        fill: { type: 'solid', color: INK },
        width: 0.08,
        innerLine: { color: WHITE, width: 0.02 },
      },
      texts: [],
    }),
  },
  {
    id: 'soft-fade',
    label: 'Soft fade',
    category: 'Minimal',
    tags: ['gradient', 'thin'],
    config: frame({
      ring: { fill: { type: 'gradient', colors: [SKY, VIOLET, PINK, SKY] }, width: 0.07 },
      texts: [],
    }),
  },
  {
    id: 'accent-arc',
    label: 'Accent arc',
    category: 'Minimal',
    tags: ['arc', 'coral'],
    config: frame({
      ring: { fill: { type: 'solid', color: CORAL }, width: 0.08, arc: { start: 300, end: 420 } },
      texts: [],
      photoClip: 'outer',
    }),
  },
  {
    id: 'whisper',
    label: 'Whisper',
    category: 'Minimal',
    tags: ['light', 'grey', 'no text'],
    config: frame({
      ring: { fill: { type: 'solid', color: '#d0d5dd' }, width: 0.06 },
      texts: [],
    }),
  },
]);
