"use client";

import { useState } from "react";
import {
  BoxPlotData,
  BoxPlotItem,
  BoxPlotElementType,
  BoxPlotHoveredElement,
} from "@/lib/types";

interface HorizontalBoxPlotProps {
  title: string;
  data: BoxPlotItem[];
  formatValue?: (value: number) => string;
  color?: string;
  unit?: string;
  showOutliers?: boolean;
}

export function HorizontalBoxPlot({
  title,
  data,
  formatValue = (v) => v.toFixed(1),
  color = "#6366f1",
  unit = "",
  showOutliers = false,
}: HorizontalBoxPlotProps) {
  const [hoveredElement, setHoveredElement] =
    useState<BoxPlotHoveredElement>(null);

  const validData = data.filter((d) => d.boxPlot !== null);

  if (validData.length === 0) {
    return (
      <div className="py-4">
        <h3 className="text-sm font-medium mb-3">{title}</h3>
        <div className="text-sm text-muted-foreground">No data available</div>
      </div>
    );
  }

  // Calculate global min/max for scaling
  // When showOutliers is false, use whisker endpoints (capped at IQR fences) for scaling
  const allValues = validData.flatMap((d) => {
    const bp = d.boxPlot!;
    if (showOutliers) {
      return [bp.min, bp.max];
    } else {
      // Calculate IQR fences
      const iqr = bp.q3 - bp.q1;
      const lowerFence = bp.q1 - 1.5 * iqr;
      const upperFence = bp.q3 + 1.5 * iqr;
      // Use fence-limited values for scaling
      const whiskerMin = Math.max(bp.min, lowerFence);
      const whiskerMax = Math.min(bp.max, upperFence);
      return [whiskerMin, whiskerMax];
    }
  });
  const globalMin = Math.min(...allValues);
  const globalMax = Math.max(...allValues);
  const range = globalMax - globalMin || 1;

  // Add padding to the range
  const padding = range * 0.1;
  const scaleMin = Math.max(0, globalMin - padding);
  const scaleMax = globalMax + padding;
  const scaleRange = scaleMax - scaleMin;

  const getPosition = (value: number) => {
    return ((value - scaleMin) / scaleRange) * 100;
  };

  const getTooltipLabel = (type: BoxPlotElementType): string => {
    switch (type) {
      case "min":
        return "Min";
      case "q1":
        return "Q1";
      case "median":
        return "Median";
      case "q3":
        return "Q3";
      case "max":
        return "Max";
      case "mean":
        return "Mean";
      case "lowerOutlier":
        return "Outlier";
      case "upperOutlier":
        return "Outlier";
    }
  };

  const getTooltipValue = (
    bp: BoxPlotData,
    type: BoxPlotElementType,
  ): string => {
    switch (type) {
      case "min":
        return `${formatValue(bp.min)}${unit}`;
      case "q1":
        return `${formatValue(bp.q1)}${unit}`;
      case "median":
        return `${formatValue(bp.median)}${unit}`;
      case "q3":
        return `${formatValue(bp.q3)}${unit}`;
      case "max":
        return `${formatValue(bp.max)}${unit}`;
      case "mean":
        return bp.mean !== undefined ? `${formatValue(bp.mean)}${unit}` : "";
      case "lowerOutlier":
        return `${formatValue(bp.min)}${unit}`;
      case "upperOutlier":
        return `${formatValue(bp.max)}${unit}`;
    }
  };

  const getTooltipPosition = (
    bp: BoxPlotData,
    type: BoxPlotElementType,
    whiskerMinPos: number,
    whiskerMaxPos: number,
  ): number => {
    switch (type) {
      case "lowerOutlier":
        return getPosition(bp.min);
      case "min":
        return whiskerMinPos;
      case "q1":
        return getPosition(bp.q1);
      case "median":
        return getPosition(bp.median);
      case "q3":
        return getPosition(bp.q3);
      case "max":
        return whiskerMaxPos;
      case "upperOutlier":
        return getPosition(bp.max);
      case "mean":
        return bp.mean !== undefined ? getPosition(bp.mean) : 0;
    }
  };

  return (
    <div className="py-4">
      <h3 className="text-sm font-medium mb-4">{title}</h3>
      <div className="flex gap-3">
        {/* Labels column */}
        <div className="w-28 shrink-0 flex flex-col">
          {validData.map((item, index) => (
            <div
              key={index}
              className="h-[60px] flex items-center text-xs text-muted-foreground leading-tight pr-2"
              title={item.name}
            >
              <span className="line-clamp-2 break-words">{item.name}</span>
            </div>
          ))}
        </div>

        {/* Plot area with edge lines */}
        <div className="flex-1 relative">
          {/* Left edge line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-border" />
          {/* Right edge line */}
          <div className="absolute right-0 top-0 bottom-0 w-px bg-border" />

          {/* Box plots */}
          {validData.map((item, index) => {
            const bp = item.boxPlot!;
            const minPos = getPosition(bp.min);
            const q1Pos = getPosition(bp.q1);
            const medianPos = getPosition(bp.median);
            const q3Pos = getPosition(bp.q3);
            const maxPos = getPosition(bp.max);
            const isRowHovered = hoveredElement?.index === index;

            // Calculate IQR for outlier detection
            const iqr = bp.q3 - bp.q1;
            const lowerFence = bp.q1 - 1.5 * iqr;
            const upperFence = bp.q3 + 1.5 * iqr;

            // Check if min/max are outliers
            const hasLowerOutlier = bp.min < lowerFence;
            const hasUpperOutlier = bp.max > upperFence;

            // Whisker endpoints (capped at fences if there are outliers)
            const whiskerMin = hasLowerOutlier
              ? Math.max(bp.min, lowerFence)
              : bp.min;
            const whiskerMax = hasUpperOutlier
              ? Math.min(bp.max, upperFence)
              : bp.max;
            const whiskerMinPos = getPosition(
              Math.max(whiskerMin, bp.q1 - 1.5 * iqr),
            );
            const whiskerMaxPos = getPosition(
              Math.min(whiskerMax, bp.q3 + 1.5 * iqr),
            );

            // Only show mean if it's within the visible range when outliers are hidden
            const meanWithinRange =
              bp.mean !== undefined &&
              (showOutliers ||
                (bp.mean >= lowerFence && bp.mean <= upperFence));
            const meanPos = meanWithinRange ? getPosition(bp.mean!) : null;

            return (
              <div key={index} className="relative h-[60px]">
                {/* Whisker line (to fence or min/max if no outliers) */}
                <div
                  className="absolute top-1/2 h-0.5 transition-opacity"
                  style={{
                    left: `${whiskerMinPos}%`,
                    width: `${whiskerMaxPos - whiskerMinPos}%`,
                    backgroundColor: color,
                    opacity: isRowHovered ? 1 : 0.8,
                    transform: "translateY(-50%)",
                  }}
                />

                {/* Min whisker cap - visual */}
                <div
                  className="absolute top-1/2 w-0.5 h-8 transition-all pointer-events-none"
                  style={{
                    left: `${whiskerMinPos}%`,
                    backgroundColor: color,
                    opacity: isRowHovered ? 1 : 0.8,
                    transform: "translateY(-50%) translateX(-50%)",
                  }}
                />
                {/* Min whisker cap - hover zone */}
                <div
                  className="absolute top-0 w-6 h-full cursor-pointer z-10"
                  style={{
                    left: `${whiskerMinPos}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() => setHoveredElement({ index, type: "min" })}
                  onMouseLeave={() => setHoveredElement(null)}
                />

                {/* Max whisker cap - visual */}
                <div
                  className="absolute top-1/2 w-0.5 h-8 transition-all pointer-events-none"
                  style={{
                    left: `${whiskerMaxPos}%`,
                    backgroundColor: color,
                    opacity: isRowHovered ? 1 : 0.8,
                    transform: "translateY(-50%) translateX(-50%)",
                  }}
                />
                {/* Max whisker cap - hover zone */}
                <div
                  className="absolute top-0 w-6 h-full cursor-pointer z-10"
                  style={{
                    left: `${whiskerMaxPos}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() => setHoveredElement({ index, type: "max" })}
                  onMouseLeave={() => setHoveredElement(null)}
                />

                {/* Lower outlier dot */}
                {showOutliers && hasLowerOutlier && (
                  <>
                    {/* Visual */}
                    <div
                      className="absolute w-2.5 h-2.5 rounded-full transition-transform pointer-events-none"
                      style={{
                        left: `${minPos}%`,
                        top: "50%",
                        backgroundColor: color,
                        transform: `translate(-50%, -50%) ${hoveredElement?.index === index && hoveredElement?.type === "lowerOutlier" ? "scale(1.4)" : "scale(1)"}`,
                      }}
                    />
                    {/* Hover zone */}
                    <div
                      className="absolute top-0 w-6 h-full cursor-pointer z-10"
                      style={{
                        left: `${minPos}%`,
                        transform: "translateX(-50%)",
                      }}
                      onMouseEnter={() =>
                        setHoveredElement({ index, type: "lowerOutlier" })
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                    />
                  </>
                )}

                {/* Upper outlier dot */}
                {showOutliers && hasUpperOutlier && (
                  <>
                    {/* Visual */}
                    <div
                      className="absolute w-2.5 h-2.5 rounded-full transition-transform pointer-events-none"
                      style={{
                        left: `${maxPos}%`,
                        top: "50%",
                        backgroundColor: color,
                        transform: `translate(-50%, -50%) ${hoveredElement?.index === index && hoveredElement?.type === "upperOutlier" ? "scale(1.4)" : "scale(1)"}`,
                      }}
                    />
                    {/* Hover zone */}
                    <div
                      className="absolute top-0 w-6 h-full cursor-pointer z-10"
                      style={{
                        left: `${maxPos}%`,
                        transform: "translateX(-50%)",
                      }}
                      onMouseEnter={() =>
                        setHoveredElement({ index, type: "upperOutlier" })
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                    />
                  </>
                )}

                {/* Box (Q1 to Q3) */}
                <div
                  className="absolute top-1/2 h-12 rounded-[2px] border-2 transition-all"
                  style={{
                    left: `${q1Pos}%`,
                    width: `${Math.max(q3Pos - q1Pos, 0.5)}%`,
                    backgroundColor: isRowHovered ? `${color}40` : `${color}25`,
                    borderColor: color,
                    transform: "translateY(-50%)",
                  }}
                />

                {/* Q1 hover zone (left edge of box) */}
                <div
                  className="absolute top-0 w-6 h-full cursor-pointer z-10"
                  style={{
                    left: `${q1Pos}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() => setHoveredElement({ index, type: "q1" })}
                  onMouseLeave={() => setHoveredElement(null)}
                />

                {/* Q3 hover zone (right edge of box) */}
                <div
                  className="absolute top-0 w-6 h-full cursor-pointer z-10"
                  style={{
                    left: `${q3Pos}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() => setHoveredElement({ index, type: "q3" })}
                  onMouseLeave={() => setHoveredElement(null)}
                />

                {/* Median line - visual */}
                <div
                  className="absolute top-1/2 h-12 transition-all pointer-events-none"
                  style={{
                    left: `${medianPos}%`,
                    backgroundColor: color,
                    width:
                      hoveredElement?.index === index &&
                      hoveredElement?.type === "median"
                        ? 4
                        : 2,
                    transform: "translateY(-50%) translateX(-50%)",
                  }}
                />
                {/* Median line - hover zone */}
                <div
                  className="absolute top-0 w-6 h-full cursor-pointer z-20"
                  style={{
                    left: `${medianPos}%`,
                    transform: "translateX(-50%)",
                  }}
                  onMouseEnter={() =>
                    setHoveredElement({ index, type: "median" })
                  }
                  onMouseLeave={() => setHoveredElement(null)}
                />

                {/* Mean marker (diamond) */}
                {meanPos !== null && (
                  <>
                    {/* Visual */}
                    <div
                      className="absolute pointer-events-none"
                      style={{
                        left: `${meanPos}%`,
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <div
                        className="w-3 h-3 border-2 transition-transform"
                        style={{
                          borderColor: color,
                          backgroundColor: "white",
                          transform: `rotate(45deg) ${hoveredElement?.index === index && hoveredElement?.type === "mean" ? "scale(1.3)" : "scale(1)"}`,
                        }}
                      />
                    </div>
                    {/* Hover zone */}
                    <div
                      className="absolute top-0 w-6 h-full cursor-pointer z-20"
                      style={{
                        left: `${meanPos}%`,
                        transform: "translateX(-50%)",
                      }}
                      onMouseEnter={() =>
                        setHoveredElement({ index, type: "mean" })
                      }
                      onMouseLeave={() => setHoveredElement(null)}
                    />
                  </>
                )}

                {/* Tooltip for hovered element */}
                {hoveredElement?.index === index && (
                  <div
                    className="absolute bottom-full mb-2 z-50 bg-popover border rounded-md shadow-lg px-2.5 py-1.5 whitespace-nowrap pointer-events-none"
                    style={{
                      left: `${getTooltipPosition(bp, hoveredElement.type, whiskerMinPos, whiskerMaxPos)}%`,
                      transform: "translateX(-50%)",
                    }}
                  >
                    <div className="text-xs">
                      <span className="text-muted-foreground">
                        {getTooltipLabel(hoveredElement.type)}:{" "}
                      </span>
                      <span className="font-medium" style={{ color }}>
                        {getTooltipValue(bp, hoveredElement.type)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scale labels */}
      <div className="flex items-center mt-2 ml-[calc(7rem+0.75rem)]">
        <span className="text-xs text-muted-foreground">
          {formatValue(scaleMin)}
          {unit}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">
          {formatValue(scaleMax)}
          {unit}
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div
            className="w-5 h-4 rounded-[2px] border"
            style={{ backgroundColor: `${color}33`, borderColor: color }}
          />
          <span>Q1-Q3</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-0.5 h-4" style={{ backgroundColor: color }} />
          <span>Median</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="w-2.5 h-2.5 border-2 rotate-45"
            style={{ borderColor: color, backgroundColor: "white" }}
          />
          <span>Mean</span>
        </div>
        {showOutliers && (
          <div className="flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span>Outlier</span>
          </div>
        )}
      </div>
    </div>
  );
}
