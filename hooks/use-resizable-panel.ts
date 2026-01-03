"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseResizablePanelOptions {
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

export function useResizablePanel(options: UseResizablePanelOptions = {}) {
  const { defaultSize = 50, minSize = 25, maxSize = 75 } = options;

  const [leftPanelWidth, setLeftPanelWidth] = useState(defaultSize);
  const isDragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback(() => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth =
        ((e.clientX - containerRect.left) / containerRect.width) * 100;
      setLeftPanelWidth(Math.min(maxSize, Math.max(minSize, newWidth)));
    },
    [minSize, maxSize]
  );

  useEffect(() => {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  return {
    containerRef,
    leftPanelWidth,
    rightPanelWidth: 100 - leftPanelWidth,
    handleMouseDown,
  };
}
