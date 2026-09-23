import re
from typing import List


def parse_fb_raw_accounts(raw_text: str) -> List[dict]:
    """
    Smart parser: extracts ad account IDs and names even from raw Facebook Business Manager text.
    Safe against excessively long input (DoS / ReDoS mitigation).
    """
    if not raw_text:
        return []
    if len(raw_text) > 65536:
        raw_text = raw_text[:65536]

    lines = [l.strip() for l in raw_text.strip().split("\n") if l.strip()]
    if len(lines) > 2000:
        lines = lines[:2000]

    id_name_pairs = []
    
    for i, line in enumerate(lines):
        match = re.search(r"(?:Ad account ID|Account ID|ID|act_)[:\s]*(\d{8,25})", line, re.IGNORECASE)
        if match:
            acc_id = f"act_{match.group(1)}"
            name = ""
            if i > 0 and not re.search(r"(?:Ad account ID|Owned by|info for|scope|permission)", lines[i-1], re.IGNORECASE):
                name = lines[i-1][:120].strip()
            id_name_pairs.append((acc_id, name))
            
    if not id_name_pairs:
        all_ids = re.findall(r"(?:act_)?(\d{8,25})", raw_text)
        for num in list(dict.fromkeys(all_ids)):
            id_name_pairs.append((f"act_{num}", ""))
            
    seen = set()
    final_list = []
    for acc_id, name in id_name_pairs:
        if acc_id not in seen:
            seen.add(acc_id)
            final_list.append({"account_id": acc_id, "parsed_name": name})
        if len(final_list) >= 500:
            break
    return final_list


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
