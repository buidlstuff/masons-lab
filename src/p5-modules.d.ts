declare module 'p5/core' {
  import p5 from 'p5';

  export default p5;
}

declare module 'p5/color' {
  const addon: (p5: typeof import('p5').default) => void;
  export default addon;
}

declare module 'p5/events' {
  const addon: (p5: typeof import('p5').default) => void;
  export default addon;
}

declare module 'p5/math' {
  const addon: (p5: typeof import('p5').default) => void;
  export default addon;
}

declare module 'p5/shape' {
  const addon: (p5: typeof import('p5').default) => void;
  export default addon;
}

declare module 'p5/type' {
  const addon: (p5: typeof import('p5').default) => void;
  export default addon;
}
