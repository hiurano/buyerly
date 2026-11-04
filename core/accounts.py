def get_short_account_label(name: str, account_id: str) -> str:
    parts = name.strip().split()
    if parts:
        last_part = parts[-1]
        if last_part.isdigit():
            if len(parts) > 1 and len(parts[-2]) <= 8 and not parts[-2].startswith("PrivateCore"):
                return f"{parts[-2]} {last_part}"
            return last_part
    if len(name) <= 8:
        return name
    clean_id = account_id.replace("act_", "")
    return clean_id[-5:]
