from collections.abc import Mapping, Sequence
from typing import Any, TypeAlias

from pydase.data_service.data_service import DataService

TableCell: TypeAlias = str | int | float | bool | None
TableRow: TypeAlias = Mapping[str, Any] | Sequence[Any]


class Table(DataService):
    """A read-only table output component for the frontend."""

    def __init__(  # noqa: PLR0913
        self,
        rows: Sequence[TableRow] | None = None,
        columns: Sequence[str] | None = None,
        *,
        max_height: int = 420,
        width: str = "max-content",
        cell_padding: str = "0.75rem 1.75rem 0.75rem 0.75rem",
        max_cell_width: str = "32rem",
    ) -> None:
        super().__init__()
        normalized_columns, normalized_rows = self._normalize_table(rows or [], columns)
        self._columns = normalized_columns
        self._rows = normalized_rows
        self._max_height = max_height
        self._width = width
        self._cell_padding = cell_padding
        self._max_cell_width = max_cell_width

    @property
    def columns(self) -> list[str]:
        """Column headers displayed in the table."""
        return self._columns

    @property
    def rows(self) -> list[dict[str, TableCell]]:
        """Rows displayed in the table."""
        return self._rows

    @property
    def max_height(self) -> int:
        """Maximum scroll area height in pixels."""
        return self._max_height

    @property
    def width(self) -> str:
        """CSS width used for the table."""
        return self._width

    @property
    def cell_padding(self) -> str:
        """CSS padding applied to table header and body cells."""
        return self._cell_padding

    @property
    def max_cell_width(self) -> str:
        """Maximum CSS width of an individual table cell."""
        return self._max_cell_width

    def set_rows(
        self,
        rows: Sequence[TableRow],
        columns: Sequence[str] | None = None,
    ) -> None:
        normalized_columns, normalized_rows = self._normalize_table(rows, columns)
        self._columns = normalized_columns
        self._rows = normalized_rows

    def append_row(self, row: TableRow) -> None:
        self._extend_columns_for_row(row)
        normalized_row = self._normalize_row(row, self._columns)
        self._rows.append(normalized_row)

    def clear(self) -> None:
        self._rows.clear()

    def _normalize_table(
        self,
        rows: Sequence[TableRow],
        columns: Sequence[str] | None,
    ) -> tuple[list[str], list[dict[str, TableCell]]]:
        normalized_columns = list(columns) if columns is not None else []
        if not normalized_columns:
            normalized_columns = self._infer_columns(rows)

        normalized_rows = [
            self._normalize_row(row, normalized_columns) for row in rows
        ]
        return normalized_columns, normalized_rows

    def _infer_columns(self, rows: Sequence[TableRow]) -> list[str]:
        columns: list[str] = []
        max_sequence_length = 0
        for row in rows:
            if isinstance(row, Mapping):
                for key in row:
                    key_string = str(key)
                    if key_string not in columns:
                        columns.append(key_string)
            else:
                max_sequence_length = max(max_sequence_length, len(row))

        if columns:
            return columns
        return [f"Column {index + 1}" for index in range(max_sequence_length)]

    def _normalize_row(
        self,
        row: TableRow,
        columns: Sequence[str],
    ) -> dict[str, TableCell]:
        if isinstance(row, Mapping):
            string_keyed_row = {str(key): value for key, value in row.items()}
            return {
                column: self._normalize_cell(string_keyed_row.get(column))
                for column in columns
            }

        return {
            column: self._normalize_cell(row[index] if index < len(row) else None)
            for index, column in enumerate(columns)
        }

    def _normalize_cell(self, value: Any) -> TableCell:
        if value is None or isinstance(value, str | int | float | bool):
            return value
        return str(value)

    def _extend_columns_for_row(self, row: TableRow) -> None:
        if isinstance(row, Mapping):
            row_columns = self._infer_columns([row])
        else:
            row_columns = [
                f"Column {index + 1}"
                for index in range(len(self._columns), len(row))
            ]

        for column in row_columns:
            if column not in self._columns:
                self._columns.append(column)
                for existing_row in self._rows:
                    existing_row[column] = None
