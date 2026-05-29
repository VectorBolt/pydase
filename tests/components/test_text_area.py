from pytest import LogCaptureFixture

from pydase.components.text_area import TextArea
from pydase.data_service.data_service import DataService
from pydase.data_service.data_service_observer import DataServiceObserver
from pydase.data_service.state_manager import StateManager
from pydase.utils.serialization.serializer import dump


def test_text_area_updates(caplog: LogCaptureFixture) -> None:
    class MyService(DataService):
        def __init__(self) -> None:
            super().__init__()
            self.output = TextArea("ready", height=240, monospace=True)

    service_instance = MyService()
    state_manager = StateManager(service_instance)
    DataServiceObserver(state_manager)

    service_instance.output.set_text("line 1\nline 2")

    assert service_instance.output.value == "line 1\nline 2"
    assert "'output.value' changed to 'line 1\nline 2'" in caplog.text
    caplog.clear()

    service_instance.output.append("\nline 3")

    assert service_instance.output.value == "line 1\nline 2\nline 3"
    assert "'output.value' changed to 'line 1\nline 2\nline 3'" in caplog.text
    caplog.clear()

    service_instance.output.clear()

    assert service_instance.output.value == ""
    assert "'output.value' changed to ''" in caplog.text


def test_text_area_serialization() -> None:
    height = 480

    class MyService(DataService):
        def __init__(self) -> None:
            super().__init__()
            self.output = TextArea(
                "long output",
                height=height,
                line_wrap=False,
                monospace=True,
            )

    output = dump(MyService())["value"]["output"]

    assert output["type"] == "TextArea"
    assert output["value"]["value"]["value"] == "long output"
    assert output["value"]["value"]["readonly"] is True
    assert output["value"]["height"]["value"] == height
    assert output["value"]["line_wrap"]["value"] is False
    assert output["value"]["monospace"]["value"] is True
