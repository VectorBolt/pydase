import inspect
import logging
from collections.abc import Callable
from typing import Any

from pydase.utils.helpers import function_has_arguments, get_attribute_doc

logger = logging.getLogger(__name__)

HELP_TEXT_PROVIDER_ATTR = "_pydase_help_text_provider"
HELP_TEXT_DEPENDENCIES_ATTR = "_pydase_help_text_dependencies"


class FunctionDefinitionError(Exception):
    pass


def frontend(func: Callable[..., Any]) -> Callable[..., Any]:
    """Decorator to mark a [`DataService`][pydase.DataService] method for frontend
    rendering. Ensures that the method does not contain arguments, as they are not
    supported for frontend rendering.
    """

    if function_has_arguments(func):
        raise FunctionDefinitionError(
            "The @frontend decorator requires functions without arguments. Function "
            f"'{func.__name__}' has at least one argument. "
            "Please remove the argument(s) from this function to use it with the "
            "@frontend decorator."
        )

    # Mark the function for frontend display.
    func._display_in_frontend = True  # type: ignore
    return func


def render_in_frontend(func: Callable[..., Any]) -> bool:
    """Determines if the method should be rendered in the frontend.

    It checks if the "@frontend" decorator was used or the method is a coroutine."""

    if inspect.iscoroutinefunction(func):
        return True

    try:
        return func._display_in_frontend  # type: ignore
    except AttributeError:
        return False


def help_text(
    provider: Callable[..., Any],
    *,
    depends_on: list[str] | tuple[str, ...] | None = None,
) -> Callable[[Callable[..., Any] | property], Callable[..., Any] | property]:
    """Decorator to define dynamic help text for a property.

    Args:
        provider:
            Callable returning the additional help text. It may either take no
            arguments or take the service instance as its only argument.
        depends_on:
            Optional attribute paths that should trigger a help text refresh when they
            change.
    """

    def decorator(
        target: Callable[..., Any] | property,
    ) -> Callable[..., Any] | property:
        func = target.fget if isinstance(target, property) else target
        if func is None:
            raise FunctionDefinitionError(
                "The @help_text decorator can only be used on properties with getters."
            )

        setattr(func, HELP_TEXT_PROVIDER_ATTR, provider)
        setattr(func, HELP_TEXT_DEPENDENCIES_ATTR, tuple(depends_on or ()))
        return target

    return decorator


def get_help_text_dependencies(prop: property) -> tuple[str, ...]:
    if prop.fget is None:
        return ()

    try:
        return prop.fget._pydase_help_text_dependencies  # type: ignore[attr-defined]
    except AttributeError:
        return ()


def get_property_doc(prop: property, obj: object) -> str | None:
    doc = get_attribute_doc(prop)
    if prop.fget is None:
        return doc

    try:
        provider = prop.fget._pydase_help_text_provider  # type: ignore[attr-defined]
    except AttributeError:
        return doc

    try:
        dynamic_doc = _call_help_text_provider(provider, obj)
    except Exception:
        logger.exception("Failed to evaluate @help_text provider for '%s'.", prop.fget)
        return doc

    if dynamic_doc is None:
        return doc

    dynamic_doc = str(dynamic_doc)
    if doc and dynamic_doc:
        return f"{doc}\n\n{dynamic_doc}"

    return dynamic_doc or doc


def _call_help_text_provider(provider: Callable[..., Any], obj: object) -> Any:
    sig = inspect.signature(provider)
    required_parameters = [
        param
        for param in sig.parameters.values()
        if param.default is inspect.Parameter.empty
        and param.kind
        in (
            inspect.Parameter.POSITIONAL_ONLY,
            inspect.Parameter.POSITIONAL_OR_KEYWORD,
            inspect.Parameter.KEYWORD_ONLY,
        )
    ]

    if len(required_parameters) == 0:
        return provider()

    if len(required_parameters) == 1:
        return provider(obj)

    raise FunctionDefinitionError(
        "The @help_text provider must either take no arguments or take the service "
        "instance as its only argument."
    )
