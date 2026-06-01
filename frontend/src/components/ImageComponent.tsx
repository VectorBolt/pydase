import React, { useEffect, useRef, useState } from "react";
import { Card, Collapse, Image } from "react-bootstrap";
import { DocStringComponent } from "./DocStringComponent";
import { ChevronDown, ChevronRight } from "react-bootstrap-icons";
import { LevelName } from "./NotificationsComponent";
import useRenderCount from "../hooks/useRenderCount";

interface ImageComponentProps {
  fullAccessPath: string;
  value: string;
  docString: string | null;
  format: string;
  width: number;
  height: number;
  colorMode: string;
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

export const ImageComponent = React.memo((props: ImageComponentProps) => {
  const {
    fullAccessPath,
    value,
    docString,
    format,
    width,
    height,
    colorMode,
    addNotification,
    displayName,
    id,
  } = props;

  const renderCount = useRenderCount();
  const [open, setOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isRawImage = format.toUpperCase() === "RAW";

  useEffect(() => {
    addNotification(`${fullAccessPath} changed.`);
  }, [addNotification, fullAccessPath, props.value]);

  useEffect(() => {
    if (!isRawImage || !value || width <= 0 || height <= 0) {
      return;
    }

    const animationId = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      try {
        const context = canvas.getContext("2d");
        if (!context) {
          return;
        }

        canvas.width = width;
        canvas.height = height;
        const bytes = decodeBase64(value);
        const rgba = convertRawImageToRgba(bytes, width, height, colorMode);
        context.putImageData(new ImageData(rgba, width, height), 0, 0);
      } catch (error) {
        console.error("Failed to render raw image data:", error);
      }
    });

    return () => window.cancelAnimationFrame(animationId);
  }, [colorMode, height, isRawImage, value, width]);

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
            ) : isRawImage ? (
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ maxWidth: "100%", height: "auto" }}
              />
            ) : (
              <Image src={`data:image/${format.toLowerCase()};base64,${value}`}></Image>
            )}
          </Card.Body>
        </Collapse>
      </Card>
    </div>
  );
});

ImageComponent.displayName = "ImageComponent";
