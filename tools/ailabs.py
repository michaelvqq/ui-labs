#!/usr/bin/env python3
"""
Drive the AI Labs agent bridge from the shell through a Studio MCP client.

    python3 ailabs.py call <command> ['<json args>']      # raw bridge call, prints JSON
    python3 ailabs.py list [filter]
    python3 ailabs.py open <story> [--controls '<json>'] [--capture phone] [--widget]
    python3 ailabs.py set '<json controls>'
    python3 ailabs.py tree [--depth N]
    python3 ailabs.py comments [--story <story>] [--all]
    python3 ailabs.py shot [<story>] [--controls '<json>'] [--capture fill|phone|tablet|laptop|desktop|WxH]
                         [--crop content|frame|none] [--out shot.png]
    python3 ailabs.py click <element path | x,y> [--text "typed text"]
    python3 ailabs.py close [--all]

It runs Luau through `execute_luau` and screenshots with `screen_capture` using the command in $UILABS_STUDIO
(default: "python3 scripts/studio.py", i.e. run from a repo that has a Studio MCP helper). The command is called as
`<cmd> <tool> '<json args>'`; text results are printed, images as "[image] <path>".
"""

import json
import os
import re
import shlex
import subprocess
import sys

STUDIO = shlex.split(os.environ.get("UILABS_STUDIO", "python3 scripts/studio.py"))
REQUIRE = 'local ui = require(game:GetService("CoreGui"):WaitForChild("AILabs", 5).API)'


def studio(tool, args):
    out = subprocess.run(STUDIO + [tool, json.dumps(args)], capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"{tool} failed: {out.stdout}{out.stderr}")
    return out.stdout.strip()


def call(command, args=None):
    """Runs a bridge command; args are JSON (Luau tables). Returns decoded JSON."""
    code = f"""
{REQUIRE}
local Http = game:GetService("HttpService")
local args = Http:JSONDecode({json.dumps(json.dumps(args or {}))})
local function plain(v, depth)
	local t = typeof(v)
	if t == "table" then
		if depth > 8 then return "<table>" end
		local out = {{}}
		for k, x in v do out[k] = plain(x, depth + 1) end
		return out
	elseif t == "number" or t == "string" or t == "boolean" or t == "nil" then
		return v
	elseif t == "Color3" then
		return "#" .. v:ToHex()
	end
	return tostring(v)
end
return Http:JSONEncode(plain(ui.call({json.dumps(command)}, args), 0))
"""
    text = studio("execute_luau", {"datamodel_type": "Edit", "code": code})
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        sys.exit(text)


def parse_capture(value):
    if value is None:
        return None
    m = re.fullmatch(r"(\d+)x(\d+)", value)
    return {"width": int(m[1]), "height": int(m[2])} if m else value


def flag(args, name, default=None, boolean=False):
    if name not in args:
        return default
    i = args.index(name)
    if boolean:
        del args[i]
        return True
    value = args[i + 1]
    del args[i : i + 2]
    return value


def shot(args):
    capture = parse_capture(flag(args, "--capture", "fill"))
    crop = flag(args, "--crop", "content")
    out = flag(args, "--out", "ailabs-shot.png")
    controls = flag(args, "--controls")
    if args:
        info = call("open", {"story": args[0], "controls": json.loads(controls) if controls else None, "capture": capture})
        for log in info.get("logs", []):
            print(f"[{log['kind']}] {log['message']}", file=sys.stderr)
    else:
        if controls:
            call("set", {"controls": json.loads(controls)})
        info = {"capture": call("capture", {"capture": capture})}
    cap = info["capture"]
    result = studio("screen_capture", {"capture_id": "UILabs_1"})
    m = re.search(r"\[image\] (\S+)", result)
    if not m:
        sys.exit(result)
    src = m[1]
    from PIL import Image

    img = Image.open(src)
    if crop != "none" and cap.get(crop):
        r = cap[crop]
        k = img.width / cap["viewport"]["width"]  # screen_capture is in physical pixels
        box = (r["x"] * k, r["y"] * k, (r["x"] + r["width"]) * k, (r["y"] + r["height"]) * k)
        box = tuple(int(round(v)) for v in box)
        box = (max(0, box[0]), max(0, box[1]), min(img.width, box[2]), min(img.height, box[3]))
        img = img.crop(box)
    img.save(out)
    print(json.dumps({"image": os.path.abspath(out), "capture": cap}, indent=2))


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return 1
    cmd = args.pop(0)
    if cmd == "call":
        result = call(args[0], json.loads(args[1]) if len(args) > 1 else {})
    elif cmd == "list":
        result = call("list", {"filter": args[0] if args else None})
    elif cmd == "open":
        controls = flag(args, "--controls")
        result = call("open", {
            "story": args[0],
            "controls": json.loads(controls) if controls else None,
            "capture": parse_capture(flag(args, "--capture")),
            "widget": flag(args, "--widget", boolean=True),
        })
    elif cmd == "set":
        result = call("set", {"controls": json.loads(args[0])})
    elif cmd == "tree":
        result = call("tree", {"depth": int(flag(args, "--depth", 6))})
    elif cmd == "comments":
        result = call("comments", {"story": flag(args, "--story"), "all": flag(args, "--all", boolean=True)})
    elif cmd == "click":
        target = args[0]
        m = re.fullmatch(r"(-?\d+),(-?\d+)", target)
        payload = {"x": int(m[1]), "y": int(m[2])} if m else {"element": target}
        text = flag(args, "--text")
        if text is not None:
            payload["text"] = text
        result = call("click", payload)
    elif cmd == "close":
        result = call("close", {"key": "all" if flag(args, "--all", boolean=True) else None})
    elif cmd == "shot":
        return shot(args)
    else:
        print(__doc__)
        return 1
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
