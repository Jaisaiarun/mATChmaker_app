# -*- coding: utf-8 -*-

"""Common utilities for the server."""

import re
from enum import Enum, auto
from typing import Any, Dict, Optional


class Status(Enum):
    """The status of a response.

    :cvar Success: The response was successful.
    :cvar Warning: The response was successful, but with warnings.
    :cvar Failure: The response was not successful.
    """

    Success = auto()
    Warning = auto()
    Failure = auto()
    Pending = auto()

    def __str__(self) -> str:
        """Return the string representation of the status.

        :return: The string representation of the status.
        :rtype: str
        """
        return self.name.lower()


class ResponseData:
    """A response object for the server."""

    def __init__(
            self,
            status: Status,
            payload: Optional[Dict[str, Any]] = None,
            message: Optional[str] = None,
    ) -> None:
        """Create a new response object.

        :param status: The status of the response.
        :type status: Status
        :param payload: The payload of the response.
        :type payload: Optional[Dict[str, Any]]
        :param message: The message of the response.
        :type message: Optional[str]
        """
        self.status = status
        self.payload = payload if payload is not None else dict()
        self.message = message if message is not None else "no message provided"

    def to_dict(self) -> Dict[str, Any]:
        """Return the response as a dictionary.

        :return: The response as a dictionary.
        :rtype: Dict[str, Any]
        """
        return dict(status=str(self.status), payload=self.payload, message=self.message)


_LOCUS_RE = re.compile(r"^(LOCUS\s+)(.+?)(\s+\d+\s+(?:bp|aa)\b.*)$")


def sanitize_genbank_locus(path: str) -> int:
    """Replace spaces in GenBank LOCUS names with underscores, in place.

    Biopython and antiSMASH fail with 'Did not recognise the LOCUS line layout'
    when the record name contains spaces (common in Geneious/SnapGene exports).
    Only LOCUS lines are touched; FASTA and already-valid files are left as is.

    :param path: Path to the uploaded file.
    :return: Number of LOCUS lines changed.
    """
    with open(path, "rb") as fh:
        data = fh.read()
    if not data.lstrip().startswith(b"LOCUS"):
        return 0

    text = data.decode("latin-1")
    lines = text.splitlines(keepends=True)
    changed = 0
    for i, line in enumerate(lines):
        if not line.startswith("LOCUS"):
            continue
        body = line.rstrip("\r\n")
        ending = line[len(body):]
        m = _LOCUS_RE.match(body)
        if not m or not re.search(r"\s", m.group(2)):
            continue
        name = re.sub(r"\s+", "_", m.group(2).strip())
        lines[i] = f"{m.group(1)}{name}{m.group(3)}{ending}"
        changed += 1

    if changed:
        with open(path, "wb") as fh:
            fh.write("".join(lines).encode("latin-1"))
    return changed
