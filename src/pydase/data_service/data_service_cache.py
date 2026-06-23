import logging
from typing import TYPE_CHECKING, Any, cast

from pydase.utils.helpers import (
    get_object_by_path_parts,
    is_property_attribute,
    parse_full_access_path,
)
from pydase.utils.serialization.serializer import (
    SerializationPathError,
    Serializer,
    get_container_item_by_key,
    get_nested_dict_by_path,
    set_nested_value_by_path,
)
from pydase.utils.serialization.types import SerializedObject

if TYPE_CHECKING:
    from pydase import DataService

logger = logging.getLogger(__name__)


class DataServiceCache:
    """Maintains a serialized cache of the current state of a DataService instance.

    This class is responsible for storing and updating a representation of the service's
    public attributes and properties. It is primarily used by the StateManager and the
    web server to serve consistent state to clients without accessing the DataService
    attributes directly.

    The cache is initialized once upon construction by serializing the full state of
    the service. After that, it can be incrementally updated using attribute paths and
    values as notified by the
    [`DataServiceObserver`][pydase.data_service.data_service_observer.DataServiceObserver].

    Args:
        service: The DataService instance whose state should be cached.
    """

    def __init__(self, service: "DataService") -> None:
        self._cache: SerializedObject
        self.service = service
        self._initialize_cache()

    @property
    def cache(self) -> SerializedObject:
        return self._cache

    def _initialize_cache(self) -> None:
        """Initializes the cache and sets up the callback."""
        logger.debug("Initializing cache.")
        self._cache = self.service.serialize()

    def update_cache(self, full_access_path: str, value: Any) -> None:
        set_nested_value_by_path(
            cast("dict[str, SerializedObject]", self._cache["value"]),
            full_access_path,
            value,
            serialized_value=self.serialize_value_for_cache(full_access_path, value),
        )

    def get_value_dict_from_cache(self, full_access_path: str) -> SerializedObject:
        return get_nested_dict_by_path(
            cast("dict[str, SerializedObject]", self._cache["value"]),
            full_access_path,
        )

    def serialize_value_for_cache(
        self, full_access_path: str, value: Any
    ) -> SerializedObject:
        if self._is_inside_cached_image_component(full_access_path):
            return self._serialize_value_with_cached_metadata(full_access_path, value)

        path_parts = parse_full_access_path(full_access_path)
        parent_obj = get_object_by_path_parts(self.service, path_parts[:-1])
        attr_name = path_parts[-1]

        if not isinstance(parent_obj, list | dict) and is_property_attribute(
            parent_obj, attr_name
        ):
            return Serializer.serialize_property(
                obj=parent_obj,
                key=attr_name,
                access_path=full_access_path,
                serialized_value=Serializer.serialize_object(
                    value,
                    access_path=full_access_path,
                ),
            )

        return Serializer.serialize_object(value, access_path=full_access_path)

    def _serialize_value_with_cached_metadata(
        self,
        full_access_path: str,
        value: Any,
    ) -> SerializedObject:
        serialized_value = Serializer.serialize_object(
            value,
            access_path=full_access_path,
        )
        try:
            cached_value_dict = self.get_value_dict_from_cache(full_access_path)
        except (SerializationPathError, KeyError):
            return serialized_value

        serialized_value["readonly"] = cached_value_dict["readonly"]
        serialized_value["doc"] = cached_value_dict["doc"]
        return serialized_value

    def _is_inside_cached_image_component(self, full_access_path: str) -> bool:
        path_parts = parse_full_access_path(full_access_path)
        current_dict = cast("dict[Any, SerializedObject]", self._cache["value"])

        try:
            for index, path_part in enumerate(path_parts):
                serialized_object = get_container_item_by_key(
                    current_dict, path_part, allow_append=False
                )
                if serialized_object.get("type") == "Image":
                    return index < len(path_parts) - 1

                value = serialized_object.get("value")
                if not isinstance(value, dict | list):
                    return False
                current_dict = cast("dict[Any, SerializedObject]", value)
        except (SerializationPathError, KeyError):
            return False

        return False
