import textwrap

import pydase
from pydase.components import Table, TextArea
from pydase.utils.decorators import frontend


class OutputComponentsDemo(pydase.DataService):
    def __init__(self) -> None:
        super().__init__()
        self.long_text = TextArea(
            textwrap.dedent(
                """\
                pydase output component demo

                This TextArea is meant for logs, reports, tracebacks, generated text,
                long status summaries, or any other read-only text that would be
                awkward in the normal one-line string field.

                The component keeps newlines, can use a monospace font, has a copy
                button, and scrolls comfortably when the output gets large.
                """
            ),
            height=160,
            monospace=False,
        )
        self.results = Table(
            rows=[
                {
                    "sample": "baseline",
                    "voltage": 1.2,
                    "current": 0.031,
                    "status": "ok",
                },
                {
                    "sample": "heated",
                    "voltage": 1.5,
                    "current": 0.045,
                    "status": "ok",
                },
                {
                    "sample": "cooldown",
                    "voltage": 1.1,
                    "current": 0.028,
                    "status": "review",
                },
            ],
            max_height=220,
            width="50%",
            cell_padding="0.75rem 5rem 0.75rem 0.75rem",
            max_cell_width="75rem"
        )
        self._next_run = 1

    @frontend
    def add_output(self) -> None:
        self.long_text.append(
            f"\nRun {self._next_run}: captured a new row and updated the table."
        )
        self.results.append_row(
            {
                "sample": f"run-{self._next_run}",
                "voltage": round(1.0 + self._next_run * 0.07, 3),
                "current": round(0.02 + self._next_run * 0.004, 3),
                "status": "new",
            }
        )
        self._next_run += 1

    @frontend
    def reset_output(self) -> None:
        self.long_text.set_text("Output reset. Press add_output to add live rows.")
        self.results.set_rows(
            rows=[
                {
                    "sample": "reset",
                    "voltage": 0.0,
                    "current": 0.0,
                    "status": "ready",
                }
            ]
        )
        self._next_run = 1


if __name__ == "__main__":
    pydase.Server(OutputComponentsDemo(), web_port=8001).run()
