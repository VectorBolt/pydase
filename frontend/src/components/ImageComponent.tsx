import React, { useEffect, useRef, useState } from "react";
import { Card, Collapse, Image as BootstrapImage } from "react-bootstrap";
import { DocStringComponent } from "./DocStringComponent";
import { ChevronDown, ChevronRight } from "react-bootstrap-icons";
import { LevelName } from "./NotificationsComponent";
import useRenderCount from "../hooks/useRenderCount";

type OverlayValue = string | number | boolean | null;

export interface ImageOverlay {
  type: string;
  [key: string]: OverlayValue;
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
  addNotification: (message: string, levelname?: LevelName) => void;
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
    addNotification,
    displayName,
    id,
  } = props;

  const renderCount = useRenderCount();
  const [open, setOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRawImage = format.toUpperCase() === "RAW";
  const shouldRenderCanvas = isRawImage || overlays.length > 0;

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
    format,
    height,
    isRawImage,
    overlays,
    shouldRenderCanvas,
    value,
    width,
  ]);

  return (
    <div className="component imageComponent" id={id}>
      <Card>
        <Card.Header
          onClick={() => setOpen(!open)}
          style={{ cursor: "pointer" }} // Change cursor style on hover
        >
          {displayName}
          <DocStringComponent docString={docString} />
          {open ? <ChevronDown /> : <ChevronRight />}
        </Card.Header>
        <Collapse in={open}>
          <Card.Body>
            {process.env.NODE_ENV === "development" && (
              <p>Render count: {renderCount}</p>
            )}
            {format === "" && value === "" ? (
              <p>No image set in the backend.</p>
            ) : shouldRenderCanvas ? (
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ maxWidth: "100%", height: "auto" }}
              />
            ) : (
              <BootstrapImage
                src={`data:image/${format.toLowerCase()};base64,${value}`}></BootstrapImage>
            )}
          </Card.Body>
        </Collapse>
      </Card>
    </div>
  );
});

ImageComponent.displayName = "ImageComponent";
