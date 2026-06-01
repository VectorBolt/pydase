import threading
import time
from pathlib import Path

import pydase
from pydase.components import Image
from pydase.utils.decorators import frontend


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
            self.frame_count += 1
            time.sleep(1 / 20)

    @frontend
    def save_snapshot(self) -> None:
        path = Path("/tmp/pydase-live-camera-snapshot.png")
        self.camera.save_to_png(path)
        self.snapshot_path = str(path)


if __name__ == "__main__":
    pydase.Server(LiveCameraImageDemo(), web_port=8001).run()
