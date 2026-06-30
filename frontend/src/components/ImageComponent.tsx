import React, { useEffect, useRef, useState } from "react";
import { Button, Card, Collapse, Image as BootstrapImage } from "react-bootstrap";
import { DocStringComponent } from "./DocStringComponent";
import { ChevronDown, ChevronRight, XCircle } from "react-bootstrap-icons";
import { LevelName } from "./NotificationsComponent";
import useRenderCount from "../hooks/useRenderCount";
import { SerializedObject } from "../types/SerializedObject";
import { propsAreEqual } from "../utils/propsAreEqual";

type OverlayValue = string | number | boolean | null;

export interface ImageOverlay {
  type: string;
  [key: string]: OverlayValue;
}

export interface ImageSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImagePoint {
  x: number;
  y: number;
}

interface ImageCoordinate {
  x: number;
  y: number;
}

interface ImageComponentProps {
  fullAccessPath: string;
  value: string;
  docString: string | null;
  format: string;
  width: number;
  height: number;
  colorMode: string;
  overlays: ImageOverlay[];
  selection: ImageSelection | null;
  selectionEnabled: boolean;
  selectionAccessPath: string;
  selectionDocString: string | null;
  hoverPositionEnabled: boolean;
  hoverPositionAccessPath: string;
  hoverPositionDocString: string | null;
  hoverPositionUpdateInterval: number;
  hoverCoordinateOffset: ImageCoordinate;
  hoverCoordinateScale: ImageCoordinate;
  hoverCoordinatePrecision: number;
  addNotification: (message: string, levelname?: LevelName) => void;
  changeCallback?: (value: SerializedObject, callback?: (ack: unknown) => void) => void;
  displayName: string;
  id: string;
}

const decodeBase64 = (value: string): Uint8Array => {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const convertRawImageToRgba = (
  bytes: Uint8Array,
  width: number,
  height: number,
  colorMode: string,
): Uint8ClampedArray => {
  const mode = colorMode.toUpperCase();
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  if (!["L", "RGB", "BGR", "RGBA", "BGRA"].includes(mode)) {
    throw new Error(`Unsupported raw color mode: ${colorMode}.`);
  }

  if (mode === "RGBA") {
    if (bytes.length !== rgba.length) {
      throw new Error("RGBA byte length does not match image dimensions.");
    }
    rgba.set(bytes);
    return rgba;
  }

  if (mode === "L") {
    if (bytes.length !== pixelCount) {
      throw new Error("Grayscale byte length does not match image dimensions.");
    }
    for (let src = 0, dst = 0; src < bytes.length; src += 1, dst += 4) {
      rgba[dst] = bytes[src];
      rgba[dst + 1] = bytes[src];
      rgba[dst + 2] = bytes[src];
      rgba[dst + 3] = 255;
    }
    return rgba;
  }

  const channelCount = mode === "RGB" || mode === "BGR" ? 3 : 4;
  if (bytes.length !== pixelCount * channelCount) {
    throw new Error("Raw byte length does not match image dimensions.");
  }

  for (let src = 0, dst = 0; src < bytes.length; src += channelCount, dst += 4) {
    const redIndex = mode === "BGR" || mode === "BGRA" ? src + 2 : src;
    const blueIndex = mode === "BGR" || mode === "BGRA" ? src : src + 2;
    rgba[dst] = bytes[redIndex];
    rgba[dst + 1] = bytes[src + 1];
    rgba[dst + 2] = bytes[blueIndex];
    rgba[dst + 3] = channelCount === 4 ? bytes[src + 3] : 255;
  }

  return rgba;
};

const getNumber = (overlay: ImageOverlay, key: string, fallback: number): number => {
  const value = overlay[key];
  return typeof value === "number" ? value : fallback;
};

const getString = (overlay: ImageOverlay, key: string, fallback: string): string => {
  const value = overlay[key];
  return typeof value === "string" ? value : fallback;
};

const getBoolean = (overlay: ImageOverlay, key: string, fallback: boolean): boolean => {
  const value = overlay[key];
  return typeof value === "boolean" ? value : fallback;
};

const applyOverlayStyle = (
  context: CanvasRenderingContext2D,
  overlay: ImageOverlay,
): void => {
  const color = getString(overlay, "color", "#00ff88");
  context.globalAlpha = getNumber(overlay, "opacity", 1);
  context.strokeStyle = color;
  context.fillStyle = getString(overlay, "fill_color", color);
  context.lineWidth = getNumber(overlay, "line_width", 1);
  context.font = getString(
    overlay,
    "font",
    `${getNumber(overlay, "font_size", 11)}px sans-serif`,
  );
};

const drawLine = (
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): void => {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
};

const drawGridOverlay = (
  context: CanvasRenderingContext2D,
  overlay: ImageOverlay,
  imageWidth: number,
  imageHeight: number,
): void => {
  const spacing = getNumber(overlay, "spacing", 32);
  const xSpacing = getNumber(overlay, "x_spacing", spacing);
  const ySpacing = getNumber(overlay, "y_spacing", spacing);

  if (xSpacing <= 0 || ySpacing <= 0) {
    return;
  }

  for (let x = 0; x <= imageWidth; x += xSpacing) {
    drawLine(context, x, 0, x, imageHeight);
  }
  for (let y = 0; y <= imageHeight; y += ySpacing) {
    drawLine(context, 0, y, imageWidth, y);
  }
};

const drawTicksOverlay = (
  context: CanvasRenderingContext2D,
  overlay: ImageOverlay,
  imageWidth: number,
  imageHeight: number,
): void => {
  const spacing = getNumber(overlay, "spacing", 32);
  const xSpacing = getNumber(overlay, "x_spacing", spacing);
  const ySpacing = getNumber(overlay, "y_spacing", spacing);
  const tickLength = getNumber(overlay, "tick_length", 6);
  const showLabels = getBoolean(overlay, "show_labels", true);
  const labelEvery = getNumber(overlay, "label_every", spacing);

  if (xSpacing <= 0 || ySpacing <= 0 || labelEvery <= 0) {
    return;
  }

  for (let x = 0; x <= imageWidth; x += xSpacing) {
    drawLine(context, x, 0, x, tickLength);
    drawLine(context, x, imageHeight, x, imageHeight - tickLength);
    if (showLabels && x % labelEvery === 0) {
      context.fillText(String(x), x + 2, tickLength + 10);
    }
  }

  for (let y = 0; y <= imageHeight; y += ySpacing) {
    drawLine(context, 0, y, tickLength, y);
    drawLine(context, imageWidth, y, imageWidth - tickLength, y);
    if (showLabels && y % labelEvery === 0) {
      context.fillText(String(y), tickLength + 2, y - 2);
    }
  }
};

const drawOverlay = (
  context: CanvasRenderingContext2D,
  overlay: ImageOverlay,
  imageWidth: number,
  imageHeight: number,
): void => {
  context.save();
  applyOverlayStyle(context, overlay);

  const type = overlay.type.toLowerCase();
  if (type === "grid") {
    drawGridOverlay(context, overlay, imageWidth, imageHeight);
  } else if (type === "ticks") {
    drawTicksOverlay(context, overlay, imageWidth, imageHeight);
  } else if (type === "rect") {
    const x = getNumber(overlay, "x", 0);
    const y = getNumber(overlay, "y", 0);
    const rectWidth = getNumber(overlay, "width", 0);
    const rectHeight = getNumber(overlay, "height", 0);
    if (typeof overlay.fill_color === "string") {
      context.fillRect(x, y, rectWidth, rectHeight);
    }
    context.strokeRect(x, y, rectWidth, rectHeight);
  } else if (type === "circle") {
    context.beginPath();
    context.arc(
      getNumber(overlay, "x", 0),
      getNumber(overlay, "y", 0),
      getNumber(overlay, "radius", 1),
      0,
      Math.PI * 2,
    );
    if (typeof overlay.fill_color === "string") {
      context.fill();
    }
    context.stroke();
  } else if (type === "cross") {
    const x = getNumber(overlay, "x", 0);
    const y = getNumber(overlay, "y", 0);
    const size = getNumber(overlay, "size", 8);
    drawLine(context, x - size, y, x + size, y);
    drawLine(context, x, y - size, x, y + size);
  } else if (type === "point") {
    context.beginPath();
    context.arc(
      getNumber(overlay, "x", 0),
      getNumber(overlay, "y", 0),
      getNumber(overlay, "radius", 3),
      0,
      Math.PI * 2,
    );
    context.fillStyle = getString(overlay, "color", "#00ff88");
    context.fill();
  } else if (type === "line") {
    drawLine(
      context,
      getNumber(overlay, "x1", 0),
      getNumber(overlay, "y1", 0),
      getNumber(overlay, "x2", 0),
      getNumber(overlay, "y2", 0),
    );
  } else if (type === "text") {
    context.fillStyle = getString(overlay, "color", "#00ff88");
    context.fillText(
      getString(overlay, "text", ""),
      getNumber(overlay, "x", 0),
      getNumber(overlay, "y", 0),
    );
  }

  context.restore();
};

const drawOverlays = (
  context: CanvasRenderingContext2D,
  overlays: ImageOverlay[],
  imageWidth: number,
  imageHeight: number,
): void => {
  for (const overlay of overlays) {
    drawOverlay(context, overlay, imageWidth, imageHeight);
  }
};

const drawSelection = (
  context: CanvasRenderingContext2D,
  selection: ImageSelection | null,
): void => {
  if (!selection) {
    return;
  }

  context.save();
  context.fillStyle = "rgba(13, 110, 253, 0.16)";
  context.strokeStyle = "#0d6efd";
  context.lineWidth = 2;
  context.setLineDash([6, 4]);
  context.fillRect(selection.x, selection.y, selection.width, selection.height);
  context.strokeRect(selection.x, selection.y, selection.width, selection.height);
  context.restore();
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max);
};

const getPointerImagePosition = (
  event: React.PointerEvent<HTMLCanvasElement>,
  coordinateMode: "edge" | "pixel" = "edge",
): ImagePoint | null => {
  const canvas = event.currentTarget;
  if (canvas.width <= 0 || canvas.height <= 0) {
    return null;
  }

  const bounds = canvas.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const scaledX = (event.clientX - bounds.left) * (canvas.width / bounds.width);
  const scaledY = (event.clientY - bounds.top) * (canvas.height / bounds.height);
  const isPixelCoordinate = coordinateMode === "pixel";

  return {
    x: clamp(
      isPixelCoordinate ? Math.floor(scaledX) : Math.round(scaledX),
      0,
      isPixelCoordinate ? canvas.width - 1 : canvas.width,
    ),
    y: clamp(
      isPixelCoordinate ? Math.floor(scaledY) : Math.round(scaledY),
      0,
      isPixelCoordinate ? canvas.height - 1 : canvas.height,
    ),
  };
};

const selectionFromPoints = (start: ImagePoint, end: ImagePoint): ImageSelection => {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
};

const serializeSelection = (
  selection: ImageSelection | null,
  fullAccessPath: string,
  docString: string | null,
): SerializedObject => {
  const serializedSelection = selection ?? { x: 0, y: 0, width: 0, height: 0 };

  const value: Record<string, SerializedObject> = {};
  for (const key of ["x", "y", "width", "height"] as const) {
    value[key] = {
      type: "int",
      value: serializedSelection[key],
      full_access_path: `${fullAccessPath}["${key}"]`,
      readonly: false,
      doc: null,
    };
  }

  return {
    type: "dict",
    value,
    full_access_path: fullAccessPath,
    readonly: false,
    doc: docString,
  };
};

const serializeHoverCoordinateValue = (
  value: number,
  fullAccessPath: string,
): SerializedObject => {
  return {
    type: Number.isInteger(value) ? "int" : "float",
    value,
    full_access_path: fullAccessPath,
    readonly: false,
    doc: null,
  } as SerializedObject;
};

const serializeHoverPosition = (
  position: ImagePoint | null,
  fullAccessPath: string,
  docString: string | null,
): SerializedObject => {
  const serializedPosition = position
    ? { ...position, hovering: true }
    : { x: 0, y: 0, hovering: false };

  return {
    type: "dict",
    value: {
      x: serializeHoverCoordinateValue(serializedPosition.x, `${fullAccessPath}["x"]`),
      y: serializeHoverCoordinateValue(serializedPosition.y, `${fullAccessPath}["y"]`),
      hovering: {
        type: "bool",
        value: serializedPosition.hovering,
        full_access_path: `${fullAccessPath}["hovering"]`,
        readonly: false,
        doc: null,
      },
    },
    full_access_path: fullAccessPath,
    readonly: false,
    doc: docString,
  };
};

const transformHoverPosition = (
  position: ImagePoint,
  offset: ImageCoordinate,
  scale: ImageCoordinate,
): ImagePoint => {
  return {
    x: offset.x + position.x * scale.x,
    y: offset.y + position.y * scale.y,
  };
};

const getSafeCoordinatePrecision = (precision: number): number => {
  if (!Number.isFinite(precision)) {
    return 3;
  }
  return clamp(Math.round(precision), 0, 12);
};

const formatHoverCoordinate = (value: number, precision: number): string => {
  if (!Number.isFinite(value)) {
    return "";
  }

  if (precision === 0) {
    return String(Math.round(value));
  }

  return value.toFixed(precision).replace(/\.?0+$/, "");
};

export const ImageComponent = React.memo((props: ImageComponentProps) => {
  const {
    fullAccessPath,
    value,
    docString,
    format,
    width,
    height,
    colorMode,
    overlays,
    selection,
    selectionEnabled,
    selectionAccessPath,
    selectionDocString,
    hoverPositionEnabled,
    hoverPositionAccessPath,
    hoverPositionDocString,
    hoverPositionUpdateInterval,
    hoverCoordinateOffset,
    hoverCoordinateScale,
    hoverCoordinatePrecision,
    addNotification,
    changeCallback = () => {},
    displayName,
    id,
  } = props;

  const renderCount = useRenderCount();
  const [open, setOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hoverLabelRef = useRef<HTMLDivElement | null>(null);
  const hoverAnimationFrameRef = useRef<number | null>(null);
  const pendingHoverPositionRef = useRef<ImagePoint | null>(null);
  const lastHoverBackendUpdateRef = useRef(0);
  const hoverBackendTimeoutRef = useRef<number | null>(null);
  const pendingBackendHoverPositionRef = useRef<ImagePoint | null>(null);
  const dragStartRef = useRef<ImagePoint | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const [draftSelection, setDraftSelection] = useState<ImageSelection | null>(null);
  const isRawImage = format.toUpperCase() === "RAW";
  const displayedSelection = draftSelection ?? selection;
  const shouldRenderCanvas =
    isRawImage ||
    overlays.length > 0 ||
    selectionEnabled ||
    hoverPositionEnabled ||
    displayedSelection !== null;

  useEffect(() => {
    addNotification(`${fullAccessPath} changed.`);
  }, [addNotification, fullAccessPath, props.value]);

  useEffect(() => {
    if (!shouldRenderCanvas || !value) {
      return;
    }

    let cancelled = false;
    const animationId = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas || cancelled) {
        return;
      }

      try {
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }

        if (isRawImage) {
          if (width <= 0 || height <= 0) {
            return;
          }
          canvas.width = width;
          canvas.height = height;
          const bytes = decodeBase64(value);
          const rgba = convertRawImageToRgba(bytes, width, height, colorMode);
          context.putImageData(new ImageData(rgba, width, height), 0, 0);
          drawOverlays(context, overlays, width, height);
          drawSelection(context, displayedSelection);
        } else {
          const image = new window.Image();
          image.onload = () => {
            if (cancelled) {
              return;
            }
            canvas.width = image.naturalWidth;
            canvas.height = image.naturalHeight;
            context.drawImage(image, 0, 0);
            drawOverlays(context, overlays, image.naturalWidth, image.naturalHeight);
            drawSelection(context, displayedSelection);
          };
          image.src = `data:image/${format.toLowerCase()};base64,${value}`;
        }
      } catch (error) {
        console.error("Failed to render image data:", error);
      }
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationId);
    };
  }, [
    colorMode,
    displayedSelection,
    format,
    height,
    isRawImage,
    overlays,
    shouldRenderCanvas,
    value,
    width,
  ]);

  useEffect(() => {
    setDraftSelection(null);
  }, [selection]);

  const updateBackendSelection = (nextSelection: ImageSelection | null) => {
    changeCallback(
      serializeSelection(nextSelection, selectionAccessPath, selectionDocString),
    );
  };

  const hoverBackendUpdateIntervalMs = Math.max(
    16,
    Number.isFinite(hoverPositionUpdateInterval)
      ? hoverPositionUpdateInterval * 1000
      : 100,
  );

  const updateHoverPositionLabel = (position: ImagePoint | null) => {
    const label = hoverLabelRef.current;
    const canvas = canvasRef.current;
    if (!label) {
      return;
    }

    if (!position || !canvas || canvas.width <= 0 || canvas.height <= 0) {
      label.style.display = "none";
      return;
    }

    const bounds = canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      label.style.display = "none";
      return;
    }

    const displayedPosition = transformHoverPosition(
      position,
      hoverCoordinateOffset,
      hoverCoordinateScale,
    );
    const precision = getSafeCoordinatePrecision(hoverCoordinatePrecision);
    label.textContent = `x: ${formatHoverCoordinate(
      displayedPosition.x,
      precision,
    )}, y: ${formatHoverCoordinate(displayedPosition.y, precision)}`;
    label.style.display = "block";

    const cssX = (position.x / canvas.width) * bounds.width;
    const cssY = (position.y / canvas.height) * bounds.height;
    const maxLeft = Math.max(4, bounds.width - label.offsetWidth - 4);
    const maxTop = Math.max(4, bounds.height - label.offsetHeight - 4);
    const left = clamp(cssX + 10, 4, maxLeft);
    const top = clamp(cssY + 10, 4, maxTop);
    label.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  };

  const queueHoverPositionLabelUpdate = (position: ImagePoint | null) => {
    pendingHoverPositionRef.current = position;
    if (hoverAnimationFrameRef.current !== null) {
      return;
    }

    hoverAnimationFrameRef.current = window.requestAnimationFrame(() => {
      hoverAnimationFrameRef.current = null;
      updateHoverPositionLabel(pendingHoverPositionRef.current);
    });
  };

  const clearHoverBackendTimeout = () => {
    if (hoverBackendTimeoutRef.current !== null) {
      window.clearTimeout(hoverBackendTimeoutRef.current);
      hoverBackendTimeoutRef.current = null;
    }
  };

  const sendHoverPositionToBackend = (position: ImagePoint | null) => {
    if (!hoverPositionEnabled || hoverPositionAccessPath === "") {
      return;
    }

    lastHoverBackendUpdateRef.current = window.performance.now();
    changeCallback(
      serializeHoverPosition(position, hoverPositionAccessPath, hoverPositionDocString),
    );
  };

  const queueBackendHoverPositionUpdate = (
    position: ImagePoint | null,
    force = false,
  ) => {
    if (!hoverPositionEnabled || hoverPositionAccessPath === "") {
      return;
    }

    const now = window.performance.now();
    const elapsed = now - lastHoverBackendUpdateRef.current;
    if (force || elapsed >= hoverBackendUpdateIntervalMs) {
      pendingBackendHoverPositionRef.current = null;
      clearHoverBackendTimeout();
      sendHoverPositionToBackend(position);
      return;
    }

    pendingBackendHoverPositionRef.current = position;
    if (hoverBackendTimeoutRef.current !== null) {
      return;
    }

    hoverBackendTimeoutRef.current = window.setTimeout(() => {
      const nextPosition = pendingBackendHoverPositionRef.current;
      pendingBackendHoverPositionRef.current = null;
      hoverBackendTimeoutRef.current = null;
      sendHoverPositionToBackend(nextPosition);
    }, hoverBackendUpdateIntervalMs - elapsed);
  };

  useEffect(() => {
    return () => {
      if (hoverAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(hoverAnimationFrameRef.current);
      }
      clearHoverBackendTimeout();
    };
  }, []);

  useEffect(() => {
    if (hoverPositionEnabled) {
      return;
    }

    pendingHoverPositionRef.current = null;
    pendingBackendHoverPositionRef.current = null;
    clearHoverBackendTimeout();
    updateHoverPositionLabel(null);
  }, [hoverPositionEnabled]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectionEnabled || event.button !== 0) {
      return;
    }

    const startPosition = getPointerImagePosition(event);
    if (!startPosition) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = startPosition;
    pointerIdRef.current = event.pointerId;
    setDraftSelection({ ...startPosition, width: 0, height: 0 });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const currentPosition = getPointerImagePosition(event);
    if (!currentPosition) {
      return;
    }

    if (hoverPositionEnabled) {
      const currentPixelPosition =
        getPointerImagePosition(event, "pixel") ?? currentPosition;
      const transformedPosition = transformHoverPosition(
        currentPixelPosition,
        hoverCoordinateOffset,
        hoverCoordinateScale,
      );
      queueHoverPositionLabelUpdate(currentPixelPosition);
      queueBackendHoverPositionUpdate(transformedPosition);
    }

    if (
      !selectionEnabled ||
      pointerIdRef.current !== event.pointerId ||
      dragStartRef.current === null
    ) {
      return;
    }

    event.preventDefault();
    setDraftSelection(selectionFromPoints(dragStartRef.current, currentPosition));
  };

  const handlePointerLeave = () => {
    if (!hoverPositionEnabled) {
      return;
    }

    queueHoverPositionLabelUpdate(null);
    queueBackendHoverPositionUpdate(null, true);
  };

  const finishSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId || dragStartRef.current === null) {
      return;
    }

    const currentPosition = getPointerImagePosition(event);
    const nextSelection = currentPosition
      ? selectionFromPoints(dragStartRef.current, currentPosition)
      : draftSelection;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStartRef.current = null;
    pointerIdRef.current = null;

    if (nextSelection && nextSelection.width > 0 && nextSelection.height > 0) {
      setDraftSelection(nextSelection);
      updateBackendSelection(nextSelection);
    } else {
      setDraftSelection(null);
    }
  };

  const cancelSelection = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current === event.pointerId) {
      dragStartRef.current = null;
      pointerIdRef.current = null;
      setDraftSelection(null);
    }
    handlePointerLeave();
  };

  const clearSelection = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setDraftSelection(null);
    updateBackendSelection(null);
  };

  return (
    <div className="component imageComponent" id={id}>
      <Card>
        <Card.Header
          className="pydase-component-header"
          onClick={() => setOpen(!open)}
          style={{ cursor: "pointer" }} // Change cursor style on hover
        >
          <span>
            {displayName}
            <DocStringComponent docString={docString} />
          </span>
          <span className="pydase-component-actions">
            {selectionEnabled && displayedSelection !== null && (
              <Button
                aria-label="Clear image selection"
                title="Clear image selection"
                size="sm"
                variant="outline-secondary"
                onClick={clearSelection}>
                <XCircle />
              </Button>
            )}
            {open ? <ChevronDown /> : <ChevronRight />}
          </span>
        </Card.Header>
        <Collapse in={open}>
          <Card.Body>
            {process.env.NODE_ENV === "development" && (
              <p>Render count: {renderCount}</p>
            )}
            {format === "" && value === "" ? (
              <p>No image set in the backend.</p>
            ) : shouldRenderCanvas ? (
              <div className="pydase-image-frame">
                <canvas
                  ref={canvasRef}
                  width={width}
                  height={height}
                  className={[
                    "pydase-image-canvas",
                    selectionEnabled ? "selectable" : "",
                    hoverPositionEnabled ? "coordinate-tracked" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishSelection}
                  onPointerCancel={cancelSelection}
                  onPointerLeave={handlePointerLeave}
                />
                {hoverPositionEnabled && (
                  <div
                    ref={hoverLabelRef}
                    aria-hidden="true"
                    className="pydase-image-hover-position"
                  />
                )}
              </div>
            ) : (
              <BootstrapImage
                src={`data:image/${format.toLowerCase()};base64,${value}`}></BootstrapImage>
            )}
          </Card.Body>
        </Collapse>
      </Card>
    </div>
  );
}, propsAreEqual);

ImageComponent.displayName = "ImageComponent";
