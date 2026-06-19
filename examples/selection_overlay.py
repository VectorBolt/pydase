import pydase
from pydase.components import Image

class Frame:
    shape = (120, 180, 3)
    dtype = "uint8"

    def tobytes(self, order="C"):
        return bytes([120, 80, 200]) * (120 * 180)

class Demo(pydase.DataService):
    def __init__(self):
        super().__init__()
        self.image = Image(selection_enabled=True)
        self.image.load_from_array(Frame())

    def print_selection(self):
        print(self.image.selection)

pydase.Server(Demo(), web_port=8021).run()
