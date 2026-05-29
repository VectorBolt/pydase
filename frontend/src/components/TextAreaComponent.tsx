import React, { useEffect, useState } from "react";
import { Button, Card, Collapse, Form } from "react-bootstrap";
import { Check2, ChevronDown, ChevronRight, Clipboard } from "react-bootstrap-icons";
import { DocStringComponent } from "./DocStringComponent";
import { LevelName } from "./NotificationsComponent";
import useRenderCount from "../hooks/useRenderCount";

interface TextAreaComponentProps {
  fullAccessPath: string;
  value: string;
  docString: string | null;
  height: number;
  lineWrap: boolean;
  monospace: boolean;
  addNotification: (message: string, levelname?: LevelName) => void;
  displayName: string;
  id: string;
}

export const TextAreaComponent = React.memo((props: TextAreaComponentProps) => {
  const {
    fullAccessPath,
    value,
    docString,
    height,
    lineWrap,
    monospace,
    addNotification,
    displayName,
    id,
  } = props;

  const renderCount = useRenderCount();
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    addNotification(`${fullAccessPath} changed.`);
  }, [props.value]);

  const copyToClipboard = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      addNotification(`${fullAccessPath} copied.`, "INFO");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      addNotification(`Could not copy ${fullAccessPath}.`, "WARNING");
    }
  };

  return (
    <div className="component textAreaComponent" id={id}>
      <Card>
        <Card.Header className="pydase-component-header" onClick={() => setOpen(!open)}>
          <span>
            {displayName}
            <DocStringComponent docString={docString} />
          </span>
          <span className="pydase-component-actions">
            <Button
              aria-label={`Copy ${displayName}`}
              title={`Copy ${displayName}`}
              size="sm"
              variant="outline-secondary"
              onClick={copyToClipboard}>
              {copied ? <Check2 /> : <Clipboard />}
            </Button>
            {open ? <ChevronDown /> : <ChevronRight />}
          </span>
        </Card.Header>
        <Collapse in={open}>
          <Card.Body>
            {process.env.NODE_ENV === "development" && (
              <div>Render count: {renderCount}</div>
            )}
            <Form.Control
              as="textarea"
              value={value}
              readOnly
              wrap={lineWrap ? "soft" : "off"}
              className={[
                "pydase-text-area-output",
                lineWrap ? "lineWrap" : "noLineWrap",
                monospace ? "monospace" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ height: `${Math.max(height, 120)}px` }}
            />
          </Card.Body>
        </Collapse>
      </Card>
    </div>
  );
});

TextAreaComponent.displayName = "TextAreaComponent";
