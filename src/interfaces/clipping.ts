export interface Highlight {
  text: string;
  note: string | null;
  page: string;
  location: string;
}

export interface Clipping {
  title: string;
  author: string;
  highlight: Highlight;
}

export interface GroupedClipping {
  title: string;
  author: string;
  highlights: Highlight[];
}

export interface Sync {
  title: string;
  author: string;
  highlightCount: number;
}
