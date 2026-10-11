"""Rule labels' colors (#383), from Linear's label palette."""

import secrets
from typing import Optional

# Linear's label colors, in its picker's order.
LABEL_COLORS = (
    "#95a2b3",  # gray
    "#5e6ad2",  # indigo
    "#26b5ce",  # teal
    "#4cb782",  # green
    "#f2c94c",  # yellow
    "#f2994a",  # orange
    "#f7c8c1",  # pink
    "#eb5757",  # red
    "#bb87fc",  # purple
    "#4ea7fc",  # blue
)
DEFAULT_LABEL_COLOR = LABEL_COLORS[0]

# What the old group icons become: shield green, rocket purple, flask amber.
ICON_COLORS = {"shield": "#4cb782", "rocket": "#bb87fc", "flask": "#f2c94c"}


def color_for_icon(icon: Optional[str]) -> str:
    return ICON_COLORS.get(icon or "", DEFAULT_LABEL_COLOR)


def random_label_color() -> str:
    """A new label's color when none is picked, as Linear gives one at random."""
    return secrets.choice(LABEL_COLORS)
