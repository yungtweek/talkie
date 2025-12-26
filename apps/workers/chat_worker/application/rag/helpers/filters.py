from typing import Any, Dict


def normalize_filters(filters: Dict[str, Any] | None):
    """
    Convert app-level filters into Weaviate `where` format.

    Rules:
      - Strings -> case-insensitive partial matching via `TextContains`.
      - Numbers/bools -> `Equal` with the corresponding value type.
      - Lists -> OR of each item following the rules above.

    Returns:
        A dict usable as Weaviate `where` or None if no filters.
    """
    if not filters:
        return None
    ops = []
    for k, v in filters.items():
        if isinstance(v, list):
            sub = []
            for item in v:
                if isinstance(item, bool):
                    sub.append({"path": [k], "operator": "Equal", "valueBoolean": item})
                elif isinstance(item, (int, float)):
                    sub.append({"path": [k], "operator": "Equal", "valueNumber": item})
                else:
                    sub.append(
                        {
                            "path": [k],
                            "operator": "TextContains",  # case-insensitive partial match
                            "valueText": str(item).lower(),
                        }
                    )
            ops.append({"operator": "Or", "operands": sub})
        elif isinstance(v, bool):
            ops.append({"path": [k], "operator": "Equal", "valueBoolean": v})
        elif isinstance(v, (int, float)):
            ops.append({"path": [k], "operator": "Equal", "valueNumber": v})
        else:
            ops.append(
                {
                    "path": [k],
                    "operator": "TextContains",  # case-insensitive partial match
                    "valueText": str(v).lower(),
                }
            )
    return {"operator": "And", "operands": ops} if len(ops) > 1 else (ops[0] if ops else None)
