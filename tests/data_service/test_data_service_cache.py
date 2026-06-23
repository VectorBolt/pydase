# ruff: noqa: INP001

import logging
from typing import Any

from pytest import MonkeyPatch

import pydase
import pydase.data_service.data_service_cache as data_service_cache_module
from pydase.data_service.data_service_observer import DataServiceObserver
from pydase.data_service.state_manager import StateManager

logger = logging.getLogger()


def test_nested_attributes_cache_callback() -> None:
    class SubClass(pydase.DataService):
        name = "Hello"

    class ServiceClass(pydase.DataService):
        class_attr = SubClass()
        name = "World"

    service_instance = ServiceClass()
    state_manager = StateManager(service_instance)
    DataServiceObserver(state_manager)

    service_instance.name = "Peepz"
    assert (
        state_manager.cache_manager.get_value_dict_from_cache("name")["value"]
        == "Peepz"
    )

    service_instance.class_attr.name = "Ciao"
    assert (
        state_manager.cache_manager.get_value_dict_from_cache("class_attr.name")[
            "value"
        ]
        == "Ciao"
    )


def test_non_image_cache_serialization_still_walks_live_object_tree(
    monkeypatch: MonkeyPatch,
) -> None:
    class ServiceClass(pydase.DataService):
        def __init__(self) -> None:
            super().__init__()
            self.value = 1

    service_instance = ServiceClass()
    state_manager = StateManager(service_instance)
    live_tree_walks: list[list[str]] = []
    original_get_object_by_path_parts = (
        data_service_cache_module.get_object_by_path_parts
    )

    def spy_get_object_by_path_parts(target_obj: Any, path_parts: list[str]) -> Any:
        live_tree_walks.append(path_parts)
        return original_get_object_by_path_parts(target_obj, path_parts)

    monkeypatch.setattr(
        data_service_cache_module,
        "get_object_by_path_parts",
        spy_get_object_by_path_parts,
    )

    state_manager.cache_manager.serialize_value_for_cache("value", 2)

    assert live_tree_walks == [[]]
