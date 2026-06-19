import base64
import io
import logging
import struct
import zlib
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TYPE_CHECKING, Any, ClassVar, TypeAlias
from urllib.request import urlopen

from pydase.data_service.data_service import DataService

if TYPE_CHECKING:
    from matplotlib.figure import Figure

OverlayValue: TypeAlias = str | int | float | bool | None
ImageOverlay: TypeAlias = dict[str, OverlayValue]
ImageSelection: TypeAlias = dict[str, int]

logger = logging.getLogger(__name__)


class Image(DataService):
    _RAW_FORMAT = "RAW"
    _GRAYSCALE_DIMENSIONS = 2
    _COLOR_DIMENSIONS = 3
    _SUPPORTED_RAW_CHANNEL_COUNTS: ClassVar[set[int]] = {1, 3, 4}
    _SUPPORTED_RAW_COLOR_MODES: ClassVar[dict[str, int]] = {
        "L": 1,
        "RGB": 3,
        "BGR": 3,
        "RGBA": 4,
        "BGRA": 4,
    }
    _SUPPORTED_OVERLAY_TYPES: ClassVar[set[str]] = {
        "circle",
        "cross",
        "grid",
        "line",
        "point",
        "rect",
        "text",
        "ticks",
    }
    _REQUIRED_OVERLAY_KEYS: ClassVar[dict[str, set[str]]] = {
        "circle": {"x", "y", "radius"},
        "cross": {"x", "y"},
        "grid": set(),
        "line": {"x1", "y1", "x2", "y2"},
        "point": {"x", "y"},
        "rect": {"x", "y", "width", "height"},
        "text": {"x", "y", "text"},
        "ticks": set(),
    }
    _NUMERIC_OVERLAY_KEYS: ClassVar[set[str]] = {
        "font_size",
        "height",
        "label_every",
        "line_width",
        "opacity",
        "radius",
        "size",
        "spacing",
        "tick_length",
        "width",
        "x",
        "x1",
        "x2",
        "x_spacing",
        "y",
        "y1",
        "y2",
        "y_spacing",
    }
    _STRING_OVERLAY_KEYS: ClassVar[set[str]] = {
        "color",
        "fill_color",
        "font",
        "text",
        "type",
    }
    _BOOLEAN_OVERLAY_KEYS: ClassVar[set[str]] = {"show_labels"}

    def __init__(
        self,
        *,
        selection_enabled: bool = False,
        on_selection_change: Callable[[ImageSelection], None] | None = None,
    ) -> None:
        super().__init__()
        if not isinstance(selection_enabled, bool):
            raise TypeError("selection_enabled must be a bool.")
        self._value: str = ""
        self._format: str = ""
        self._width: int = 0
        self._height: int = 0
        self._color_mode: str = ""
        self._overlays: list[ImageOverlay] = []
        self._selection_enabled = selection_enabled
        self._selection: ImageSelection = self._empty_selection()
        self._on_selection_change = on_selection_change

    @property
    def value(self) -> str:
        return self._value

    @property
    def format(self) -> str:
        return self._format

    @property
    def width(self) -> int:
        return self._width

    @property
    def height(self) -> int:
        return self._height

    @property
    def color_mode(self) -> str:
        return self._color_mode

    @property
    def overlays(self) -> list[ImageOverlay]:
        overlays = self._overlays
        return [dict(overlay) for overlay in overlays]

    @property
    def selection_enabled(self) -> bool:
        """Whether users can draw an image-region selection in the frontend."""
        return self._selection_enabled

    @selection_enabled.setter
    def selection_enabled(self, value: bool) -> None:
        if not isinstance(value, bool):
            raise TypeError("selection_enabled must be a bool.")
        object.__setattr__(self, "_selection_enabled", value)

    @property
    def selection(self) -> ImageSelection:
        """Region selected in the frontend as x/y/width/height image pixels.

        A zero width or height indicates that no frontend selection is active.
        """

        return dict(self._selection)

    @selection.setter
    def selection(self, value: Mapping[str, Any] | None) -> None:
        normalised_selection = self._normalise_selection(value)
        if self._selection == normalised_selection:
            return

        object.__setattr__(self, "_selection", normalised_selection)
        if self._on_selection_change is not None:
            self._on_selection_change(dict(normalised_selection))

    def load_from_path(self, path: Path | str) -> None:
        with open(path, "rb") as image_file:
            image_data = image_file.read()
        format_ = self._get_image_format_from_bytes(image_data)
        if format_ is None:
            logger.error("Unsupported image format. Skipping...")
            return
        value_ = base64.b64encode(image_data)
        self._load_from_base64(value_, format_)

    def load_from_matplotlib_figure(self, fig: "Figure", format_: str = "png") -> None:
        buffer = io.BytesIO()
        fig.savefig(buffer, format=format_)
        value_ = base64.b64encode(buffer.getvalue())
        self._load_from_base64(value_, format_)

    def load_from_array(self, array: Any, color_mode: str = "auto") -> None:
        """Load an ndarray-like uint8 image as raw, lossless pixel data.

        Supported shapes are ``(height, width)``, ``(height, width, 1)``,
        ``(height, width, 3)``, and ``(height, width, 4)``. The default
        ``color_mode="auto"`` treats three-channel arrays as RGB and four-channel
        arrays as RGBA. Pass ``"BGR"`` or ``"BGRA"`` for OpenCV-style arrays.
        """

        height, width, mode = self._get_raw_image_metadata(array, color_mode)
        raw = self._array_to_c_order_bytes(array)
        expected_length = height * width * self._SUPPORTED_RAW_COLOR_MODES[mode]
        if len(raw) != expected_length:
            raise ValueError(
                "The array byte length does not match its shape and color mode."
            )

        value_ = base64.b64encode(raw)
        self._load_from_base64(
            value_,
            self._RAW_FORMAT,
            width=width,
            height=height,
            color_mode=mode,
        )

    def load_from_url(self, url: str) -> None:
        with urlopen(url) as response:
            image_data = response.read()
        format_ = self._get_image_format_from_bytes(image_data)
        if format_ is None:
            logger.error("Unsupported image format. Skipping...")
            return
        value_ = base64.b64encode(image_data)
        self._load_from_base64(value_, format_)

    def load_from_base64(self, value_: bytes, format_: str | None = None) -> None:
        if format_ is None:
            format_ = self._get_image_format_from_bytes(base64.b64decode(value_))
            if format_ is None:
                logger.warning(
                    "Format of passed byte string could not be determined. Skipping..."
                )
                return
        self._load_from_base64(value_, format_)

    def to_png_bytes(self) -> bytes:
        """Return the current image as PNG bytes.

        Raw array images are encoded with a small built-in PNG encoder. Already-loaded
        PNG images are returned unchanged.
        """

        if self._value == "":
            raise ValueError("No image has been loaded.")

        if self._format.upper() == "PNG":
            return base64.b64decode(self._value)

        if self._format != self._RAW_FORMAT:
            raise ValueError(
                "Only RAW and PNG image data can be converted to PNG without an "
                "optional image decoder."
            )

        return self._raw_to_png(
            base64.b64decode(self._value),
            width=self._width,
            height=self._height,
            color_mode=self._color_mode,
        )

    def save_to_png(self, path: Path | str) -> None:
        Path(path).write_bytes(self.to_png_bytes())

    def set_overlays(self, overlays: list[ImageOverlay]) -> None:
        """Replace the overlays rendered on top of the image.

        Overlay coordinates are expressed in image pixel coordinates. Supported
        overlay types are ``grid``, ``ticks``, ``rect``, ``circle``, ``cross``,
        ``point``, ``line``, and ``text``.
        """

        normalised_overlays = [
            self._normalise_overlay(overlay) for overlay in overlays
        ]
        self._set_overlays_if_changed(normalised_overlays)

    def add_overlay(self, overlay: ImageOverlay) -> None:
        """Append one overlay to the current overlay list."""

        self.set_overlays([*self._overlays, overlay])

    def clear_overlays(self) -> None:
        """Remove all overlays from the image."""

        self._set_overlays_if_changed([])

    def clear_selection(self) -> None:
        """Clear the frontend image-region selection."""

        self.selection = self._empty_selection()

    def _load_from_base64(
        self,
        value_: bytes,
        format_: str,
        *,
        width: int = 0,
        height: int = 0,
        color_mode: str = "",
    ) -> None:
        value = value_.decode("utf-8")
        self._set_if_changed("_width", width)
        self._set_if_changed("_height", height)
        self._set_if_changed("_color_mode", color_mode)
        self._set_if_changed("_format", format_)
        self._set_if_changed("_value", value)

    def _get_image_format_from_bytes(self, value_: bytes) -> str | None:
        format_map = {
            b"\xff\xd8": "JPEG",
            b"\x89PNG": "PNG",
            b"GIF": "GIF",
            b"RIFF": "WEBP",
        }
        for signature, format_name in format_map.items():
            if value_.startswith(signature):
                return format_name
        return None

    def _set_if_changed(self, name: str, value: Any) -> None:
        if getattr(self, name) != value:
            setattr(self, name, value)

    def _set_overlays_if_changed(self, overlays: list[ImageOverlay]) -> None:
        if self._overlays == overlays:
            return

        self._notify_change_start("overlays")
        object.__setattr__(self, "_overlays", overlays)
        self._notify_changed("overlays", [dict(overlay) for overlay in overlays])

    def _normalise_overlay(self, overlay: Mapping[str, Any]) -> ImageOverlay:
        if not isinstance(overlay, Mapping):
            raise TypeError("Each overlay must be a dictionary-like object.")

        overlay_type = overlay.get("type")
        if not isinstance(overlay_type, str):
            raise ValueError("Each overlay must include a string 'type' field.")

        overlay_type = overlay_type.lower()
        if overlay_type not in self._SUPPORTED_OVERLAY_TYPES:
            supported_types = ", ".join(sorted(self._SUPPORTED_OVERLAY_TYPES))
            raise ValueError(
                f"Unsupported overlay type. Use one of: {supported_types}."
            )

        missing_keys = self._REQUIRED_OVERLAY_KEYS[overlay_type] - overlay.keys()
        if missing_keys:
            missing_keys_str = ", ".join(sorted(missing_keys))
            raise ValueError(
                f"Overlay type {overlay_type!r} is missing required key(s): "
                f"{missing_keys_str}."
            )

        normalised_overlay: ImageOverlay = {"type": overlay_type}
        for key, value in overlay.items():
            if key == "type":
                continue
            normalised_overlay[key] = self._normalise_overlay_value(key, value)
        return normalised_overlay

    def _normalise_overlay_value(self, key: str, value: Any) -> OverlayValue:
        if value is None:
            return None

        if key in self._BOOLEAN_OVERLAY_KEYS:
            return self._normalise_bool_overlay_value(key, value)

        if key in self._NUMERIC_OVERLAY_KEYS:
            return self._normalise_numeric_overlay_value(key, value)

        if key in self._STRING_OVERLAY_KEYS:
            return self._normalise_string_overlay_value(key, value)

        if isinstance(value, str | int | float | bool):
            return value

        raise TypeError(
            f"Overlay key {key!r} must be a string, number, bool, or None."
        )

    @staticmethod
    def _normalise_bool_overlay_value(key: str, value: Any) -> bool:
        if isinstance(value, bool):
            return value
        raise TypeError(f"Overlay key {key!r} must be a bool.")

    @staticmethod
    def _normalise_numeric_overlay_value(key: str, value: Any) -> int | float:
        if isinstance(value, int | float) and not isinstance(value, bool):
            return value
        raise TypeError(f"Overlay key {key!r} must be a number.")

    @staticmethod
    def _normalise_string_overlay_value(key: str, value: Any) -> str:
        if isinstance(value, str):
            return value
        raise TypeError(f"Overlay key {key!r} must be a string.")

    def _normalise_selection(
        self,
        selection: Mapping[str, Any] | None,
    ) -> ImageSelection:
        if selection is None:
            return self._empty_selection()

        if not isinstance(selection, Mapping):
            raise TypeError("selection must be a dictionary-like object or None.")

        required_keys = {"x", "y", "width", "height"}
        missing_keys = required_keys - selection.keys()
        if missing_keys:
            missing_keys_str = ", ".join(sorted(missing_keys))
            raise ValueError(
                f"selection is missing required key(s): {missing_keys_str}."
            )

        normalised_selection = {
            key: self._normalise_selection_value(key, selection[key])
            for key in ("x", "y", "width", "height")
        }

        if normalised_selection["width"] == 0 or normalised_selection["height"] == 0:
            if any(value != 0 for value in normalised_selection.values()):
                raise ValueError(
                    "selection must either be empty or have positive width and height."
                )
            return normalised_selection

        if normalised_selection["width"] < 0 or normalised_selection["height"] < 0:
            raise ValueError("selection width and height must be non-negative.")

        return normalised_selection

    @staticmethod
    def _empty_selection() -> ImageSelection:
        return {"x": 0, "y": 0, "width": 0, "height": 0}

    @staticmethod
    def _normalise_selection_value(key: str, value: Any) -> int:
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(f"selection key {key!r} must be an integer.")
        if value < 0:
            raise ValueError(f"selection key {key!r} must be non-negative.")
        return value

    def _get_raw_image_metadata(
        self,
        array: Any,
        color_mode: str,
    ) -> tuple[int, int, str]:
        shape = getattr(array, "shape", None)
        dtype = getattr(array, "dtype", None)

        if shape is None or dtype is None or not hasattr(array, "tobytes"):
            raise TypeError(
                "array must be ndarray-like and expose shape, dtype, and tobytes()."
            )

        if str(dtype) != "uint8":
            raise TypeError("Only uint8 arrays can be displayed as raw image data.")

        shape_tuple = tuple(int(dim) for dim in shape)
        height, width, channels = self._parse_raw_image_shape(shape_tuple)
        mode = self._normalise_raw_color_mode(color_mode, channels)

        if height <= 0 or width <= 0:
            raise ValueError("Image dimensions must be positive.")

        return height, width, mode

    def _parse_raw_image_shape(self, shape: tuple[int, ...]) -> tuple[int, int, int]:
        if len(shape) == self._GRAYSCALE_DIMENSIONS:
            return shape[0], shape[1], 1

        if (
            len(shape) == self._COLOR_DIMENSIONS
            and shape[2] in self._SUPPORTED_RAW_CHANNEL_COUNTS
        ):
            return shape[0], shape[1], shape[2]

        raise ValueError(
            "Raw images must have shape (height, width), (height, width, 1), "
            "(height, width, 3), or (height, width, 4)."
        )

    def _normalise_raw_color_mode(self, color_mode: str, channels: int) -> str:
        inferred_mode = {1: "L", 3: "RGB", 4: "RGBA"}[channels]
        mode = inferred_mode if color_mode.lower() == "auto" else color_mode.upper()

        expected_channels = self._SUPPORTED_RAW_COLOR_MODES.get(mode)
        if expected_channels is None:
            supported_modes = ", ".join(self._SUPPORTED_RAW_COLOR_MODES)
            raise ValueError(f"Unsupported color mode. Use one of: {supported_modes}.")

        if expected_channels != channels:
            raise ValueError(
                f"Color mode {mode!r} expects {expected_channels} channel(s), "
                f"but the array has {channels}."
            )

        return mode

    def _array_to_c_order_bytes(self, array: Any) -> bytes:
        try:
            return array.tobytes(order="C")
        except TypeError:
            return array.tobytes()

    @classmethod
    def _raw_to_png(
        cls,
        raw: bytes,
        *,
        width: int,
        height: int,
        color_mode: str,
    ) -> bytes:
        mode = color_mode.upper()
        color_type_map = {
            "L": 0,
            "RGB": 2,
            "BGR": 2,
            "RGBA": 6,
            "BGRA": 6,
        }
        color_type = color_type_map[mode]
        channels = cls._SUPPORTED_RAW_COLOR_MODES[mode]

        if mode in {"BGR", "BGRA"}:
            raw = cls._swap_blue_and_red(raw, channels)

        stride = width * channels
        scanlines = b"".join(
            b"\x00" + raw[row_start : row_start + stride]
            for row_start in range(0, height * stride, stride)
        )

        header = struct.pack(">IIBBBBB", width, height, 8, color_type, 0, 0, 0)
        return (
            b"\x89PNG\r\n\x1a\n"
            + cls._png_chunk(b"IHDR", header)
            + cls._png_chunk(b"IDAT", zlib.compress(scanlines))
            + cls._png_chunk(b"IEND", b"")
        )

    @staticmethod
    def _swap_blue_and_red(raw: bytes, channels: int) -> bytes:
        converted = bytearray(raw)
        for offset in range(0, len(converted), channels):
            converted[offset], converted[offset + 2] = (
                converted[offset + 2],
                converted[offset],
            )
        return bytes(converted)

    @staticmethod
    def _png_chunk(chunk_type: bytes, data: bytes) -> bytes:
        checksum = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", checksum)
        )
