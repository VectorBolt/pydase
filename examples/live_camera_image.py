import math
import threading
import time
from pathlib import Path

import pydase
from pydase.components import Image
from pydase.utils.decorators import frontend

import logging
logging.getLogger("pydase").setLevel(logging.INFO)


class CameraFrame:
    def __init__(self, width: int, height: int, data: bytes) -> None:
        self.shape = (height, width, 3)
        self.dtype = "uint8"
        self._data = data

    def tobytes(self, order: str = "C") -> bytes:
        return self._data


class LiveCameraImageDemo(pydase.DataService):
    def __init__(self) -> None:
        super().__init__()
        self.camera = Image()
        self.frame_count = 0
        self.snapshot_path = ""
        self._running = True
        self._thread = threading.Thread(target=self._stream_frames, daemon=True)
        self._thread.start()

    def _stream_frames(self) -> None:
        height = 240
        width = 320

        while self._running:
            frame_data = bytearray(width * height * 3)
            offset = 0
            for y in range(height):
                for x in range(width):
                    frame_data[offset] = (x + self.frame_count * 4) % 256
                    frame_data[offset + 1] = (y * 2 + self.frame_count * 3) % 256
                    frame_data[offset + 2] = (
                        (x + y) // 2 + self.frame_count * 5
                    ) % 256
                    offset += 3

            self.camera.load_from_array(CameraFrame(width, height, bytes(frame_data)))
            self.camera.set_overlays(self._build_overlays(width, height))
            self.frame_count += 1
            time.sleep(1 / 20)

    def _build_overlays(
        self, width: int, height: int
    ) -> list[dict[str, str | int | float | bool]]:
        center_x = 48 + (self.frame_count * 3) % (width - 96)
        center_y = height // 2 + round(42 * math.sin(self.frame_count * 0.1))
        box_width = 58
        box_height = 42

        return [
            {
                "type": "grid",
                "spacing": 32,
                "color": "#ffffff33",
                "line_width": 1,
            },
            {
                "type": "ticks",
                "spacing": 32,
                "label_every": 64,
                "tick_length": 7,
                "show_labels": True,
                "color": "#ffffffaa",
                "font_size": 10,
            },
            {
                "type": "rect",
                "x": center_x - box_width // 2,
                "y": center_y - box_height // 2,
                "width": box_width,
                "height": box_height,
                "color": "#00ff88",
                "line_width": 2,
            },
            {
                "type": "circle",
                "x": center_x,
                "y": center_y,
                "radius": 22,
                "color": "#ffcc00",
                "line_width": 2,
            },
            {
                "type": "cross",
                "x": center_x,
                "y": center_y,
                "size": 9,
                "color": "#ff3355",
                "line_width": 2,
            },
            {
                "type": "text",
                "x": 8,
                "y": height - 10,
                "text": f"frame {self.frame_count}",
                "color": "#ffffff",
                "font_size": 12,
            },
        ]

    @frontend
    def save_snapshot(self) -> None:
        path = Path("/tmp/pydase-live-camera-snapshot.png")
        self.camera.save_to_png(path)
        self.snapshot_path = str(path)


if __name__ == "__main__":
    pydase.Server(LiveCameraImageDemo(), web_port=8001).run()
