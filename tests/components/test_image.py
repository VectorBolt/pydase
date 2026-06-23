import base64
import sys
import zlib
from pathlib import Path

from pytest import LogCaptureFixture, MonkeyPatch, raises

import pydase
import pydase.components
import pydase.components.image as image_module
import pydase.observer_pattern.observer.property_observer as property_observer_module
from pydase.data_service.data_service_observer import DataServiceObserver
from pydase.data_service.state_manager import StateManager
from pydase.utils.serialization.serializer import dump

if sys.version_info < (3, 13):
    PATHLIB_PATH = "pathlib.Path"
else:
    PATHLIB_PATH = "pathlib._local.Path"

EXPECTED_RAW_WIDTH = 2
CAMERA_FRAME_HEIGHT = 240
CAMERA_FRAME_WIDTH = 320
CAMERA_FRAME_CHANNELS = 3
STRESS_FRAME_SIDE_LENGTH = 2


class FakeArray:
    def __init__(
        self, shape: tuple[int, ...], data: bytes, dtype: str = "uint8"
    ) -> None:
        self.shape = shape
        self.dtype = dtype
        self._data = data

    def tobytes(self, order: str = "C") -> bytes:
        return self._data


class FakeImageResponse:
    def __enter__(self):
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return b"\x89PNG\r\n\x1a\n"


def _get_png_chunk_data(png_data: bytes, chunk_type: bytes) -> bytes:
    offset = 8
    while offset < len(png_data):
        length = int.from_bytes(png_data[offset : offset + 4], "big")
        current_chunk_type = png_data[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        if current_chunk_type == chunk_type:
            return png_data[data_start:data_end]
        offset = data_end + 4

    raise ValueError(f"Chunk {chunk_type!r} not found.")


def test_image_functions(
    caplog: LogCaptureFixture, monkeypatch: MonkeyPatch
) -> None:
    class MyService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.my_image = pydase.components.Image()

    monkeypatch.setattr(image_module, "urlopen", lambda _url: FakeImageResponse())

    service_instance = MyService()
    state_manager = StateManager(service_instance)
    DataServiceObserver(state_manager)

    service_instance.my_image.load_from_url("https://picsum.photos/200")

    caplog.clear()


def test_image_load_from_array() -> None:
    image = pydase.components.Image()
    image_data = bytes([255, 0, 0, 0, 255, 0])

    image.load_from_array(FakeArray((1, 2, 3), image_data))

    assert image.format == "RAW"
    assert image.width == EXPECTED_RAW_WIDTH
    assert image.height == 1
    assert image.color_mode == "RGB"
    assert base64.b64decode(image.value) == image_data


def test_image_loads_camera_frame_like_array() -> None:
    class CameraService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.camera = pydase.components.Image()

        def update_frame(self, frame: FakeArray) -> None:
            self.camera.load_from_array(frame)

    service = CameraService()
    frame_data = bytes(
        (index % 256)
        for index in range(
            CAMERA_FRAME_HEIGHT * CAMERA_FRAME_WIDTH * CAMERA_FRAME_CHANNELS
        )
    )

    service.update_frame(
        FakeArray(
            (CAMERA_FRAME_HEIGHT, CAMERA_FRAME_WIDTH, CAMERA_FRAME_CHANNELS),
            frame_data,
        )
    )

    assert service.camera.format == "RAW"
    assert service.camera.width == CAMERA_FRAME_WIDTH
    assert service.camera.height == CAMERA_FRAME_HEIGHT
    assert service.camera.color_mode == "RGB"
    assert base64.b64decode(service.camera.value) == frame_data


def test_image_load_from_array_notifies_public_fields_once() -> None:
    class CameraService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.camera = pydase.components.Image()

    service = CameraService()
    state_manager = StateManager(service)
    observer = DataServiceObserver(state_manager)
    notifications: list[str] = []
    observer.add_notification_callback(
        lambda full_access_path, _value, _cached_value_dict: notifications.append(
            full_access_path
        )
    )

    service.camera.load_from_array(FakeArray((1, 2, 3), bytes([1, 2, 3, 4, 5, 6])))

    assert notifications == [
        "camera.width",
        "camera.height",
        "camera.color_mode",
        "camera.format",
        "camera.value",
    ]
    assert all(
        not path_part.startswith("_")
        for notification in notifications
        for path_part in notification.split(".")
    )

    notifications.clear()

    service.camera.load_from_array(FakeArray((1, 2, 3), bytes([7, 8, 9, 10, 11, 12])))

    assert notifications == ["camera.value"]


def test_image_load_from_array_stress_updates_cache() -> None:
    class CameraService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.camera = pydase.components.Image()

    service = CameraService()
    state_manager = StateManager(service)
    observer = DataServiceObserver(state_manager)
    notifications: list[str] = []
    observer.add_notification_callback(
        lambda full_access_path, _value, _cached_value_dict: notifications.append(
            full_access_path
        )
    )

    latest_frame = b""
    for frame_index in range(100):
        latest_frame = bytes((frame_index + offset) % 256 for offset in range(12))
        service.camera.load_from_array(
            FakeArray(
                (STRESS_FRAME_SIDE_LENGTH, STRESS_FRAME_SIDE_LENGTH, 3),
                latest_frame,
            )
        )

    assert all(
        not path_part.startswith("_")
        for notification in notifications
        for path_part in notification.split(".")
    )
    assert state_manager.cache_manager.get_value_dict_from_cache("camera.width")[
        "value"
    ] == STRESS_FRAME_SIDE_LENGTH
    assert state_manager.cache_manager.get_value_dict_from_cache("camera.height")[
        "value"
    ] == STRESS_FRAME_SIDE_LENGTH
    assert (
        state_manager.cache_manager.get_value_dict_from_cache("camera.value")["value"]
        == base64.b64encode(latest_frame).decode("utf-8")
    )


def test_image_update_through_property_path_does_not_rescan_dependencies(
    monkeypatch: MonkeyPatch,
) -> None:
    class Preview(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.image = pydase.components.Image()

    class CameraService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self._preview = Preview()

        @property
        def preview(self) -> Preview:
            return self._preview

    service = CameraService()
    preview = service.preview
    state_manager = StateManager(service)
    DataServiceObserver(state_manager)

    def fail_getsource(_obj: object) -> str:
        raise AssertionError("property dependencies were rescanned")

    monkeypatch.setattr(property_observer_module.inspect, "getsource", fail_getsource)

    preview.image.load_from_array(FakeArray((1, 2, 3), bytes([1, 2, 3, 4, 5, 6])))

    assert state_manager.cache_manager.get_value_dict_from_cache(
        "preview.image.value"
    )["value"] == base64.b64encode(bytes([1, 2, 3, 4, 5, 6])).decode("utf-8")


def test_image_overlay_management() -> None:
    image = pydase.components.Image()
    image.set_overlays(
        [
            {"type": "GRID", "spacing": 32, "color": "#ffffff66"},
            {
                "type": "rect",
                "x": 12,
                "y": 8,
                "width": 40,
                "height": 30,
                "color": "#00ff88",
                "line_width": 2,
            },
        ]
    )

    assert image.overlays == [
        {"type": "grid", "spacing": 32, "color": "#ffffff66"},
        {
            "type": "rect",
            "x": 12,
            "y": 8,
            "width": 40,
            "height": 30,
            "color": "#00ff88",
            "line_width": 2,
        },
    ]

    image.add_overlay({"type": "cross", "x": 32, "y": 24, "size": 6})

    assert image.overlays[-1] == {"type": "cross", "x": 32, "y": 24, "size": 6}

    image.clear_overlays()

    assert image.overlays == []


def test_image_overlay_update_notifies_observer_once() -> None:
    class MyService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.my_image = pydase.components.Image()

    service_instance = MyService()
    state_manager = StateManager(service_instance)
    observer = DataServiceObserver(state_manager)
    notifications: list[str] = []
    observer.add_notification_callback(
        lambda full_access_path, _value, _cached_value_dict: notifications.append(
            full_access_path
        )
    )

    service_instance.my_image.set_overlays([{"type": "cross", "x": 32, "y": 24}])

    assert notifications == ["my_image.overlays"]


def test_image_selection_management(caplog: LogCaptureFixture) -> None:
    callback_values: list[dict[str, int]] = []
    image = pydase.components.Image(
        selection_enabled=True,
        on_selection_change=callback_values.append,
    )

    image.selection = {"x": 12, "y": 8, "width": 40, "height": 30}
    selection = image.selection
    selection["x"] = 99

    assert image.selection_enabled is True
    assert image.selection == {"x": 12, "y": 8, "width": 40, "height": 30}
    assert callback_values == [{"x": 12, "y": 8, "width": 40, "height": 30}]

    caplog.clear()

    image.clear_selection()

    assert image.selection == {"x": 0, "y": 0, "width": 0, "height": 0}
    assert callback_values[-1] == {"x": 0, "y": 0, "width": 0, "height": 0}
    assert "Class 'NoneType' does not inherit from DataService" not in caplog.text


def test_image_selection_update_notifies_observer_once() -> None:
    class MyService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.my_image = pydase.components.Image(selection_enabled=True)

    service_instance = MyService()
    state_manager = StateManager(service_instance)
    observer = DataServiceObserver(state_manager)
    notifications: list[str] = []
    observer.add_notification_callback(
        lambda full_access_path, _value, _cached_value_dict: notifications.append(
            full_access_path
        )
    )

    service_instance.my_image.selection = {
        "x": 12,
        "y": 8,
        "width": 40,
        "height": 30,
    }

    assert notifications == ["my_image.selection"]


def test_image_selection_validation() -> None:
    image = pydase.components.Image()

    with raises(TypeError, match="selection_enabled must be a bool"):
        pydase.components.Image(selection_enabled="yes")  # type: ignore[arg-type]

    with raises(ValueError, match="missing required"):
        image.selection = {"x": 1, "y": 2, "width": 3}

    with raises(TypeError, match="must be an integer"):
        image.selection = {"x": 1.0, "y": 2, "width": 3, "height": 4}

    with raises(ValueError, match="non-negative"):
        image.selection = {"x": -1, "y": 2, "width": 3, "height": 4}

    with raises(ValueError, match="empty or have positive"):
        image.selection = {"x": 0, "y": 0, "width": 0, "height": 4}


def test_image_overlay_validation() -> None:
    image = pydase.components.Image()

    with raises(ValueError, match="Unsupported overlay type"):
        image.set_overlays([{"type": "polygon"}])

    with raises(ValueError, match="missing required"):
        image.set_overlays([{"type": "rect", "x": 1, "y": 2}])

    with raises(TypeError, match="must be a number"):
        image.set_overlays([{"type": "cross", "x": "1", "y": 2}])


def test_image_load_from_array_as_png() -> None:
    image = pydase.components.Image()

    image.load_from_array(FakeArray((1, 1, 3), bytes([1, 2, 3])), color_mode="BGR")
    png_data = image.to_png_bytes()

    assert png_data.startswith(b"\x89PNG\r\n\x1a\n")
    assert image._get_image_format_from_bytes(png_data) == "PNG"
    assert _get_png_chunk_data(png_data, b"IHDR")[:10] == (
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02"
    )
    assert zlib.decompress(_get_png_chunk_data(png_data, b"IDAT")) == (
        b"\x00\x03\x02\x01"
    )


def test_image_save_to_png(tmp_path: Path) -> None:
    image = pydase.components.Image()
    image.load_from_array(FakeArray((1, 1), bytes([123])))
    path = tmp_path / "image.png"

    image.save_to_png(path)

    assert path.read_bytes() == image.to_png_bytes()


def test_image_serialization() -> None:
    class MyService(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.my_image = pydase.components.Image()

    serialized = dump(MyService())
    image = serialized["value"]["my_image"]  # type: ignore[index]
    image_value = image["value"]  # type: ignore[index]

    assert serialized["full_access_path"] == ""
    assert serialized["name"] == "MyService"
    assert serialized["type"] == "DataService"
    assert image["full_access_path"] == "my_image"
    assert image["name"] == "Image"
    assert image["type"] == "Image"
    assert image["value"]["selection_enabled"]["value"] is False
    assert image["value"]["selection"]["value"]["x"]["value"] == 0
    assert image["value"]["selection"]["value"]["y"]["value"] == 0
    assert image["value"]["selection"]["value"]["width"]["value"] == 0
    assert image["value"]["selection"]["value"]["height"]["value"] == 0

    assert set(image_value) == {
        "add_overlay",
        "clear_overlays",
        "clear_selection",
        "color_mode",
        "format",
        "height",
        "load_from_array",
        "load_from_base64",
        "load_from_matplotlib_figure",
        "load_from_path",
        "load_from_url",
        "save_to_png",
        "selection",
        "selection_enabled",
        "set_overlays",
        "overlays",
        "to_png_bytes",
        "value",
        "width",
    }
    assert image_value["value"]["value"] == ""
    assert image_value["format"]["value"] == ""
    assert image_value["width"]["value"] == 0
    assert image_value["height"]["value"] == 0
    assert image_value["color_mode"]["value"] == ""
    assert image_value["overlays"]["value"] == []

    assert image_value["load_from_array"]["signature"]["parameters"] == {
        "array": {"annotation": "typing.Any", "default": {}},
        "color_mode": {
            "annotation": "<class 'str'>",
            "default": {
                "type": "str",
                "value": "auto",
                "readonly": False,
                "doc": None,
            },
        },
    }
    assert image_value["load_from_path"]["signature"]["parameters"]["path"] == {
        "annotation": f"{PATHLIB_PATH} | str",
        "default": {},
    }
    assert image_value["save_to_png"]["signature"]["parameters"]["path"] == {
        "annotation": f"{PATHLIB_PATH} | str",
        "default": {},
    }
