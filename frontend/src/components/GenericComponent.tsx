import React, { useContext } from "react";
import { ButtonComponent } from "./ButtonComponent";
import { NumberComponent, NumberObject } from "./NumberComponent";
import { SliderComponent } from "./SliderComponent";
import { EnumComponent } from "./EnumComponent";
import { MethodComponent } from "./MethodComponent";
import { StringComponent } from "./StringComponent";
import { ListComponent } from "./ListComponent";
import { DataServiceComponent, DataServiceJSON } from "./DataServiceComponent";
import { DeviceConnectionComponent } from "./DeviceConnection";
import { ImageComponent, ImageOverlay, ImageSelection } from "./ImageComponent";
import { TableComponent } from "./TableComponent";
import { TextAreaComponent } from "./TextAreaComponent";
import { LevelName } from "./NotificationsComponent";
import { getIdFromFullAccessPath } from "../utils/stringUtils";
import { WebSettingsContext } from "../WebSettings";
import { updateValue } from "../socket";
import { DictComponent } from "./DictComponent";
import { parseFullAccessPath } from "../utils/stateUtils";
import { SerializedEnum, SerializedObject } from "../types/SerializedObject";
import { TaskComponent, TaskStatus } from "./TaskComponent";

interface GenericComponentProps {
  attribute: SerializedObject;
  isInstantUpdate: boolean;
  addNotification: (message: string, levelname?: LevelName) => void;
}

const getPathFromPathParts = (pathParts: string[]): string => {
  let path = "";
  for (const pathPart of pathParts) {
    if (!pathPart.startsWith("[") && path !== "") {
      path += ".";
    }
    path += pathPart;
  }
  return path;
};

const createDisplayNameFromAccessPath = (fullAccessPath: string): string => {
  const displayNameParts = [];
  const parsedFullAccessPath = parseFullAccessPath(fullAccessPath);
  for (let i = parsedFullAccessPath.length - 1; i >= 0; i--) {
    const item = parsedFullAccessPath[i];
    displayNameParts.unshift(item);
    if (!item.startsWith("[")) {
      break;
    }
  }
  return getPathFromPathParts(displayNameParts);
};

function changeCallback(
  value: SerializedObject,
  callback: (ack: undefined | SerializedObject) => void = () => {},
) {
  updateValue(value, callback);
}

const deserializeImageOverlayValue = (
  attribute: SerializedObject,
): string | number | boolean | null => {
  if (
    attribute.type === "str" ||
    attribute.type === "int" ||
    attribute.type === "float" ||
    attribute.type === "bool" ||
    attribute.type === "NoneType" ||
    attribute.type === "None"
  ) {
    return attribute.value;
  }

  return null;
};

const deserializeImageOverlay = (attribute: SerializedObject): ImageOverlay | null => {
  if (attribute.type !== "dict") {
    return null;
  }

  const overlay: ImageOverlay = { type: "" };
  for (const [key, value] of Object.entries(attribute.value)) {
    overlay[key] = deserializeImageOverlayValue(value);
  }

  return overlay.type === "" ? null : overlay;
};

const deserializeImageOverlays = (attribute: SerializedObject): ImageOverlay[] => {
  if (attribute.type !== "list") {
    return [];
  }

  return attribute.value
    .map(deserializeImageOverlay)
    .filter((overlay): overlay is ImageOverlay => overlay !== null);
};

const deserializeImageSelection = (
  attribute: SerializedObject | undefined,
): ImageSelection | null => {
  if (!attribute || attribute.type !== "dict") {
    return null;
  }

  const selection = Object.fromEntries(
    (["x", "y", "width", "height"] as const).map((key) => [
      key,
      attribute.value[key]?.type === "int" ? attribute.value[key].value : null,
    ]),
  ) as Record<keyof ImageSelection, number | null>;

  if (
    selection.x === null ||
    selection.y === null ||
    selection.width === null ||
    selection.height === null
  ) {
    return null;
  }

  if (selection.width <= 0 || selection.height <= 0) {
    return null;
  }

  return {
    x: selection.x,
    y: selection.y,
    width: selection.width,
    height: selection.height,
  };
};

const deserializeImageCoordinate = (
  attribute: SerializedObject | undefined,
  fallback: { x: number; y: number },
): { x: number; y: number } => {
  if (!attribute || attribute.type !== "dict") {
    return fallback;
  }

  const x = attribute.value["x"];
  const y = attribute.value["y"];
  const xValue = x?.type === "int" || x?.type === "float" ? Number(x.value) : null;
  const yValue = y?.type === "int" || y?.type === "float" ? Number(y.value) : null;

  if (xValue === null || yValue === null) {
    return fallback;
  }

  return { x: xValue, y: yValue };
};

export const GenericComponent = React.memo(
  ({ attribute, isInstantUpdate, addNotification }: GenericComponentProps) => {
    const { full_access_path: fullAccessPath } = attribute;
    const id = getIdFromFullAccessPath(fullAccessPath);
    const webSettings = useContext(WebSettingsContext);
    const webSetting = webSettings[fullAccessPath];

    let displayName = createDisplayNameFromAccessPath(fullAccessPath);

    if (webSetting) {
      if (webSetting.display === false) {
        return null;
      }
      if (webSetting.displayName) {
        displayName = webSetting.displayName;
      }
    }

    if (attribute.type === "bool") {
      return (
        <ButtonComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.doc}
          readOnly={attribute.readonly}
          value={Boolean(attribute.value)}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "float" || attribute.type === "int") {
      return (
        <NumberComponent
          type={attribute.type}
          fullAccessPath={fullAccessPath}
          docString={attribute.doc}
          readOnly={attribute.readonly}
          value={Number(attribute.value)}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "Quantity") {
      return (
        <NumberComponent
          type="Quantity"
          fullAccessPath={fullAccessPath}
          docString={attribute.doc}
          readOnly={attribute.readonly}
          value={Number(attribute.value["magnitude"])}
          unit={attribute.value["unit"]}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "NumberSlider") {
      return (
        <SliderComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.value["value"].doc}
          readOnly={attribute.readonly}
          value={attribute.value["value"] as NumberObject}
          min={attribute.value["min"] as NumberObject}
          max={attribute.value["max"] as NumberObject}
          stepSize={attribute.value["step_size"] as NumberObject}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "Enum" || attribute.type === "ColouredEnum") {
      return (
        <EnumComponent
          {...(attribute as SerializedEnum)}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "method") {
      return (
        <MethodComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.doc}
          addNotification={addNotification}
          displayName={displayName}
          id={id}
          render={attribute.frontend_render}
        />
      );
    } else if (attribute.type === "str") {
      return (
        <StringComponent
          fullAccessPath={fullAccessPath}
          value={attribute.value as string}
          readOnly={attribute.readonly}
          docString={attribute.doc}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          changeCallback={changeCallback}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type == "Task") {
      return (
        <TaskComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.doc}
          status={attribute.value["status"].value as TaskStatus}
          addNotification={addNotification}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "DataService") {
      return (
        <DataServiceComponent
          props={attribute.value as DataServiceJSON}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          displayName={displayName}
          id={id}
          defaultOpen={webSetting?.defaultOpen}
        />
      );
    } else if (attribute.type === "DeviceConnection") {
      return (
        <DeviceConnectionComponent
          fullAccessPath={fullAccessPath}
          props={attribute.value as DataServiceJSON}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          displayName={displayName}
          id={id}
        />
      );
    } else if (attribute.type === "list") {
      return (
        <ListComponent
          value={attribute.value}
          docString={attribute.doc}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          id={id}
        />
      );
    } else if (attribute.type === "dict") {
      return (
        <DictComponent
          value={attribute.value}
          docString={attribute.doc}
          isInstantUpdate={isInstantUpdate}
          addNotification={addNotification}
          id={id}
        />
      );
    } else if (attribute.type === "Image") {
      return (
        <ImageComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.value["value"].doc}
          displayName={displayName}
          id={id}
          addNotification={addNotification}
          value={attribute.value["value"]["value"] as string}
          format={attribute.value["format"]["value"] as string}
          width={Number(attribute.value["width"]["value"])}
          height={Number(attribute.value["height"]["value"])}
          colorMode={attribute.value["color_mode"]["value"] as string}
          overlays={deserializeImageOverlays(attribute.value["overlays"])}
          selection={deserializeImageSelection(attribute.value["selection"])}
          selectionEnabled={Boolean(attribute.value["selection_enabled"]?.["value"])}
          selectionAccessPath={attribute.value["selection"]["full_access_path"]}
          selectionDocString={attribute.value["selection"].doc}
          hoverPositionEnabled={Boolean(
            attribute.value["hover_position_enabled"]?.["value"],
          )}
          hoverPositionAccessPath={
            attribute.value["hover_position"]?.["full_access_path"] ?? ""
          }
          hoverPositionDocString={attribute.value["hover_position"]?.doc ?? null}
          hoverPositionUpdateInterval={Number(
            attribute.value["hover_position_update_interval"]?.["value"] ?? 0.1,
          )}
          hoverCoordinateOffset={deserializeImageCoordinate(
            attribute.value["hover_coordinate_offset"],
            { x: 0, y: 0 },
          )}
          hoverCoordinateScale={deserializeImageCoordinate(
            attribute.value["hover_coordinate_scale"],
            { x: 1, y: 1 },
          )}
          hoverCoordinatePrecision={Number(
            attribute.value["hover_coordinate_precision"]?.["value"] ?? 3,
          )}
          changeCallback={changeCallback}
        />
      );
    } else if (attribute.type === "TextArea") {
      return (
        <TextAreaComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.value["value"].doc}
          displayName={displayName}
          id={id}
          addNotification={addNotification}
          value={attribute.value["value"]["value"] as string}
          height={Number(attribute.value["height"]["value"])}
          lineWrap={Boolean(attribute.value["line_wrap"]["value"])}
          monospace={Boolean(attribute.value["monospace"]["value"])}
        />
      );
    } else if (attribute.type === "Table") {
      return (
        <TableComponent
          fullAccessPath={fullAccessPath}
          docString={attribute.value["rows"].doc}
          displayName={displayName}
          id={id}
          addNotification={addNotification}
          changeCallback={changeCallback}
          columns={attribute.value["columns"] as SerializedObject}
          rows={attribute.value["rows"] as SerializedObject}
          selectedIndices={attribute.value["selected_indices"] as SerializedObject}
          maxHeight={Number(attribute.value["max_height"]["value"])}
          width={attribute.value["width"]["value"] as string}
          cellPadding={attribute.value["cell_padding"]["value"] as string}
          maxCellWidth={attribute.value["max_cell_width"]["value"] as string}
          selectionMode={
            attribute.value["selection_mode"]["value"] as "none" | "single" | "multiple"
          }
        />
      );
    } else {
      return <div key={fullAccessPath}>{fullAccessPath}</div>;
    }
  },
);

GenericComponent.displayName = "GenericComponent";
