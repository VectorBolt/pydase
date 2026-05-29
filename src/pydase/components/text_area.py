from pydase.data_service.data_service import DataService


class TextArea(DataService):
    """A read-only, multi-line text output component for the frontend."""

    def __init__(
        self,
        value: str = "",
        *,
        height: int = 320,
        line_wrap: bool = True,
        monospace: bool = False,
    ) -> None:
        super().__init__()
        self._value = value
        self._height = height
        self._line_wrap = line_wrap
        self._monospace = monospace

    @property
    def value(self) -> str:
        """The text displayed in the read-only text area."""
        return self._value

    @property
    def height(self) -> int:
        """The preferred text area height in pixels."""
        return self._height

    @property
    def line_wrap(self) -> bool:
        """Whether long lines wrap inside the text area."""
        return self._line_wrap

    @property
    def monospace(self) -> bool:
        """Whether the text area uses a monospace font."""
        return self._monospace

    def set_text(self, value: str) -> None:
        self._value = value

    def append(self, value: str) -> None:
        self._value += value

    def clear(self) -> None:
        self._value = ""
