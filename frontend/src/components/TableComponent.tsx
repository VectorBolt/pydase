import React, { useEffect, useMemo, useState } from "react";
import { Badge, Card, Collapse, Table as BootstrapTable } from "react-bootstrap";
import { ChevronDown, ChevronRight } from "react-bootstrap-icons";
import { DocStringComponent } from "./DocStringComponent";
import { LevelName } from "./NotificationsComponent";
import { SerializedObject } from "../types/SerializedObject";
import useRenderCount from "../hooks/useRenderCount";

type TableCell = string | number | boolean | null;

interface TableComponentProps {
  fullAccessPath: string;
  columns: SerializedObject;
  rows: SerializedObject;
  docString: string | null;
  maxHeight: number;
  width: string;
  cellPadding: string;
  maxCellWidth: string;
  addNotification: (message: string, levelname?: LevelName) => void;
  displayName: string;
  id: string;
}

const formatCellValue = (value: TableCell): string => {
  if (value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
};

const serializedToPlainValue = (object: SerializedObject | undefined): TableCell => {
  if (!object) {
    return null;
  }

  switch (object.type) {
    case "str":
    case "int":
    case "float":
    case "bool":
      return object.value;
    case "None":
    case "NoneType":
    case "method":
      return null;
    case "Quantity":
      return `${object.value.magnitude} ${object.value.unit}`;
    case "Enum":
    case "ColouredEnum":
    case "Exception":
      return object.value;
    case "list":
      return object.value
        .map((item) => formatCellValue(serializedToPlainValue(item)))
        .join(", ");
    case "dict":
      return JSON.stringify(
        Object.fromEntries(
          Object.entries(object.value).map(([key, value]) => [
            key,
            serializedToPlainValue(value),
          ]),
        ),
      );
    case "DataService":
    case "DeviceConnection":
    case "Image":
    case "NumberSlider":
    case "Table":
    case "Task":
    case "TextArea":
      return object.name;
  }
};

const getColumns = (columnsObject: SerializedObject): string[] => {
  if (columnsObject.type !== "list") {
    return [];
  }

  return columnsObject.value.map((column, index) => {
    const label = formatCellValue(serializedToPlainValue(column));
    return label || `Column ${index + 1}`;
  });
};

const getRows = (rowsObject: SerializedObject, columns: string[]): TableCell[][] => {
  if (rowsObject.type !== "list") {
    return [];
  }

  return rowsObject.value.map((row) => {
    if (row.type === "dict") {
      return columns.map((column) => serializedToPlainValue(row.value[column]));
    }

    if (row.type === "list") {
      return columns.map((_, index) => serializedToPlainValue(row.value[index]));
    }

    return [serializedToPlainValue(row)];
  });
};

const getColumnClassNames = (rows: TableCell[][], columns: string[]): string[] => {
  return columns.map((_, columnIndex) => {
    const values = rows
      .map((row) => row[columnIndex])
      .filter((value): value is Exclude<TableCell, null> => value !== null);

    if (values.length === 0) {
      return "";
    }
    if (values.every((value) => typeof value === "number")) {
      return "numericCell";
    }
    if (values.every((value) => typeof value === "boolean")) {
      return "booleanCell";
    }
    return "";
  });
};

export const TableComponent = React.memo((props: TableComponentProps) => {
  const {
    fullAccessPath,
    columns: serializedColumns,
    rows: serializedRows,
    docString,
    maxHeight,
    width,
    cellPadding,
    maxCellWidth,
    addNotification,
    displayName,
    id,
  } = props;

  const renderCount = useRenderCount();
  const [open, setOpen] = useState(true);
  const columns = useMemo(() => getColumns(serializedColumns), [serializedColumns]);
  const rows = useMemo(
    () => getRows(serializedRows, columns),
    [serializedRows, columns],
  );
  const columnClassNames = useMemo(
    () => getColumnClassNames(rows, columns),
    [rows, columns],
  );

  useEffect(() => {
    addNotification(`${fullAccessPath} changed.`);
  }, [props.columns, props.rows]);

  return (
    <div className="component tableComponent" id={id}>
      <Card>
        <Card.Header className="pydase-component-header" onClick={() => setOpen(!open)}>
          <span>
            {displayName}
            <DocStringComponent docString={docString} />
            <Badge bg="secondary" pill className="ms-2">
              {rows.length} rows
            </Badge>
          </span>
          {open ? <ChevronDown /> : <ChevronRight />}
        </Card.Header>
        <Collapse in={open}>
          <Card.Body>
            {process.env.NODE_ENV === "development" && (
              <div>Render count: {renderCount}</div>
            )}
            {columns.length === 0 ? (
              <div className="text-muted">No rows to display.</div>
            ) : (
              <div
                className="pydase-table-scroll"
                style={{ maxHeight: `${Math.max(maxHeight, 160)}px` }}>
                <BootstrapTable
                  striped
                  hover
                  size="sm"
                  className="mb-0 pydase-output-table"
                  style={
                    {
                      "--pydase-table-width": width,
                      "--pydase-table-cell-padding": cellPadding,
                      "--pydase-table-max-cell-width": maxCellWidth,
                    } as React.CSSProperties
                  }>
                  <thead>
                    <tr>
                      {columns.map((column, columnIndex) => (
                        <th key={column} className={columnClassNames[columnIndex]}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={`${fullAccessPath}-${rowIndex}`}>
                        {columns.map((column, columnIndex) => {
                          const value = row[columnIndex] ?? null;
                          return (
                            <td
                              key={`${column}-${columnIndex}`}
                              className={columnClassNames[columnIndex]}
                              title={formatCellValue(value)}>
                              {formatCellValue(value)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </BootstrapTable>
              </div>
            )}
          </Card.Body>
        </Collapse>
      </Card>
    </div>
  );
});

TableComponent.displayName = "TableComponent";
