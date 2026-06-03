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
import { ImageComponent, ImageOverlay } from "./ImageComponent";
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
          columns={attribute.value["columns"] as SerializedObject}
          rows={attribute.value["rows"] as SerializedObject}
          maxHeight={Number(attribute.value["max_height"]["value"])}
          width={attribute.value["width"]["value"] as string}
          cellPadding={attribute.value["cell_padding"]["value"] as string}
          maxCellWidth={attribute.value["max_cell_width"]["value"] as string}
        />
      );
    } else {
      return <div key={fullAccessPath}>{fullAccessPath}</div>;
    }
  },
);

GenericComponent.displayName = "GenericComponent";
