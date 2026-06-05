from pydase.components.table import Table
from pydase.data_service.data_service import DataService
from pydase.data_service.data_service_observer import DataServiceObserver
from pydase.data_service.state_manager import StateManager
from pydase.utils.serialization.serializer import dump


def test_table_normalizes_rows_and_columns() -> None:
    table = Table(
        rows=[
            [1, "alpha"],
            [2, "beta"],
        ],
        columns=["id", "name"],
    )

    table.append_row([3, "gamma", "done"])
    table.append_row({"id": 4, "name": "delta", "status": "queued"})

    assert table.columns == ["id", "name", "Column 3", "status"]
    assert table.rows == [
        {"id": 1, "name": "alpha", "Column 3": None, "status": None},
        {"id": 2, "name": "beta", "Column 3": None, "status": None},
        {"id": 3, "name": "gamma", "Column 3": "done", "status": None},
        {"id": 4, "name": "delta", "Column 3": None, "status": "queued"},
    ]


def test_table_updates_observed_state() -> None:
    class MyService(DataService):
        def __init__(self) -> None:
            super().__init__()
            self.table = Table(columns=["step", "value"])

    service_instance = MyService()
    state_manager = StateManager(service_instance)
    DataServiceObserver(state_manager)

    service_instance.table.append_row({"step": "start", "value": 1.0})

    cached_rows = state_manager.cache_manager.get_value_dict_from_cache(
        "table.rows"
    )["value"]
    assert cached_rows[0]["value"]["step"]["value"] == "start"
    assert cached_rows[0]["value"]["value"]["value"] == 1.0


def test_table_selection_updates_callback_and_selected_rows() -> None:
    callback_values: list[list[int]] = []
    table = Table(
        rows=[
            {"name": "alpha"},
            {"name": "beta"},
            {"name": "gamma"},
        ],
        selection_mode="multiple",
        on_selection_change=callback_values.append,
    )

    table.selected_indices = [0, 2, 2, -1, 8]

    assert table.selected_indices == [0, 2]
    assert table.selected_rows == [{"name": "alpha"}, {"name": "gamma"}]
    assert callback_values == [[0, 2]]

    table.set_rows([{"name": "alpha"}])

    assert table.selected_indices == [0]
    assert callback_values[-1] == [0]

    table.clear()

    assert table.selected_indices == []
    assert callback_values[-1] == []


def test_table_single_selection_mode() -> None:
    table = Table(
        rows=[
            {"name": "alpha"},
            {"name": "beta"},
        ],
        selection_mode="single",
        selected_indices=[0, 1],
    )

    assert table.selected_indices == [0]


def test_table_serialization() -> None:
    score = 0.95
    max_height = 300
    width = "100%"
    cell_padding = "0.5rem 1rem"
    max_cell_width = "20rem"

    class MyService(DataService):
        def __init__(self) -> None:
            super().__init__()
            self.table = Table(
                rows=[
                    {"name": "alpha", "score": score},
                    {"name": "beta", "score": None},
                ],
                max_height=max_height,
                width=width,
                cell_padding=cell_padding,
                max_cell_width=max_cell_width,
                selection_mode="multiple",
                selected_indices=[0],
            )

    table = dump(MyService())["value"]["table"]

    assert table["type"] == "Table"
    assert table["value"]["columns"]["value"][0]["value"] == "name"
    assert table["value"]["columns"]["value"][1]["value"] == "score"
    assert table["value"]["rows"]["value"][0]["value"]["name"]["value"] == "alpha"
    assert table["value"]["rows"]["value"][0]["value"]["score"]["value"] == score
    assert table["value"]["rows"]["value"][1]["value"]["score"]["value"] is None
    assert table["value"]["max_height"]["value"] == max_height
    assert table["value"]["width"]["value"] == width
    assert table["value"]["cell_padding"]["value"] == cell_padding
    assert table["value"]["max_cell_width"]["value"] == max_cell_width
    assert table["value"]["selection_mode"]["value"] == "multiple"
    assert table["value"]["selected_indices"]["value"][0]["value"] == 0
