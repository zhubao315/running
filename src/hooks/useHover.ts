import { useState } from 'react';

type HoverHook = [boolean, { onMouseOver: () => void; onMouseOut: () => void }];

const useHover = (): HoverHook => {
  const [hovered, setHovered] = useState(false);
  const [timer, setTimer] = useState<number>();

  const eventHandlers = {
    onMouseOver() {
      setTimer(window.setTimeout(() => setHovered(true), 500)); // 500ms delay
    },
    onMouseOut() {
      window.clearTimeout(timer);
      setHovered(false);
    },
  };

  return [hovered, eventHandlers];
};

export default useHover;
