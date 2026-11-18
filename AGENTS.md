# AI Labs: driving UI Labs from scripts and AI agents

**AI Labs** is this fork of [UI Labs](https://github.com/PepeElToro41/ui-labs), renamed so it can be told apart from the
marketplace plugin when both are installed.

This fork adds an **agent bridge**: a scriptable API reachable from anything that runs Luau in Studio's edit
DataModel (Studio MCP `execute_luau`, the command bar, another plugin). It also adds:

- a **capture mode** that renders a story where Studio's `screen_capture` can see it, at a chosen size;
- a **Comment tool** so a person can click an element in a story and leave a note that an agent reads back.

The plugin works as before for humans. The bridge exists while the plugin is loaded in Edit mode, whether or not the
AI Labs window is open: when it's closed the app runs headless.

## Install

```bash
corepack pnpm@9 install          # pnpm 10+ ignores .npmrc's public-hoist-pattern, so @rbxts-js goes missing
npx rbxtsc
rojo build default.project.json --output ~/Documents/Roblox/Plugins/AILabs.rbxm
```

Studio loads new local plugins when it starts, so restart Studio (or reopen the place) after the first install.
It shows up as **AI Labs** (toolbar, window title and header) and runs alongside the marketplace UI Labs.

## The API

```lua
local ui = require(game:GetService("CoreGui"):WaitForChild("AILabs").API)
```

`CoreGui.AILabs` holds a `BindableFunction` named `Invoke`, which works across plugin and command-bar VMs, and
the `API` ModuleScript that wraps it. Every call returns plain data, or raises `[AI Labs] <reason>`.

| Call | What it does |
|---|---|
| `ui.status()` | Version, whether the window is open, the story count, mounted stories (with controls and capture info), the unresolved comment count and the capture presets |
| `ui.list(filter?)` | `{ path, name, storybook }` for every story; `filter` is a substring of the full path |
| `ui.open(story, opts?)` | Opens the AI Labs window and shows the story in its main tab. If that story is already open it's reused, keeping its control values (`fresh = true` remounts it); otherwise the tab switches to it. Waits for it to render. Returns its key, controls, capture info and the `logs` produced while mounting |
| `ui.click(path \| { x, y }, opts?)` | Targets an element in the story (path, or a point relative to the story root). For a TextBox, `opts.text` types into it and fires FocusLost (Enter unless `submit = false`). For a button it returns `{ clicked = false, reason }` and shows the user an "AI: please click here" ring for 5 s, because Studio won't let plugins press buttons in Edit mode. Use story controls to change state |
| `ui.set(controls, key?)` | Sets controls by name (groups as nested tables), validated and coerced, then waits for the re-render |
| `ui.controls(key?)` | Each control's `type` and `value`, plus `options` for Choose/EnumList and `min`/`max`/`step` for Slider |
| `ui.reload(key?)` | Hot-reloads the story; returns logs |
| `ui.capture(size?, opts?)` | Moves the story into capture mode (below). `false` puts it back in the AI Labs window |
| `ui.tree(opts?)` | The story's GUI tree: name, class, rect relative to the story root, text (with `textFits = false` when it overflows), images (with `imageLoaded = false`). `opts.depth`, `opts.maxNodes`, `opts.path` |
| `ui.tool(name?)` | Turns on `"select"` (Select Elements) or `"comment"` (Comment For AI), or `"none"` |
| `ui.tweaks(opts?)` | Unresolved property tweaks (see Tweak below). `opts.story` filters, `opts.all` includes resolved ones |
| `ui.tweak({ element, property, value, target? })` | Applies and records a tweak from a script. `value` can be typed or text like `"24"`, `"#ff8800"` or `"{0.5, 0}, {0, 40}"` |
| `ui.claimTweak(id, note?)` / `ui.resolveTweak(id, note?)` | The same for tweaks. Resolving stops re-applying it (the code has the value now) |
| `ui.clearTweaks({ id \| story \| resolved = true \| all = true, restore? })` | Deletes tweaks. By default it puts the original values back on mounted stories |
| `ui.showOriginal(true \| false)` | Shows the untweaked values, or the tweaked ones again |
| `ui.inset(on?, key?)` | Turns the GUI inset overlay on or off (below). `ui.open(story, { inset = true })` and `ui.capture("phone", { inset = true })` do the same. `ui.status().mounted[i].inset` gives `{ device, topbar, safeArea, size }` |
| `ui.zoom(percent?, key?)` | Sets the panel zoom and resets the pan |
| `ui.window(open?)` | Opens (`true`) or closes (`false`) the AI Labs window |
| `ui.close(key?)` / `ui.closeAll()` | Unmounts a story, or all of them |
| `ui.logs(since?)` | The last 200 UI Labs warnings plus Output warnings and errors (`since` is an `os.clock()` value) |
| `ui.comments(opts?)` | Unresolved comments. `opts.story` filters to a story, `opts.all` includes resolved ones |
| `ui.addComment(text, key?)` | Leaves a page comment on the open story (`scope = "story"`, no element) |
| `ui.seenComment(id, by?)` / `ui.seenTweak(id, by?)` | Marks an item **Seen** (read) in the user's panel. `by` is your session name, shown as "Seen by ...". `ui.comments({ markSeen = true, by = ... })` marks everything it returns |
| `ui.claimComment(id, note?)` | Marks a comment **In progress** in the user's panel ("Looking at the grid columns"). Do this before starting work |
| `ui.resolveComment(id, note?)` | Marks it **Done**, with a note of what changed ("Grid now shows 5 columns on phones"). `ui.resolveComment(id, false)` reopens it |
| `ui.deleteComments({ id = ... } \| { story = ... } \| { resolved = true } \| { all = true })` | Deletes comments |

**The user sees what the agent does.** Agents drive the same AI Labs window the user is looking at, never a hidden
copy or a pile of tabs:
- `ui.open` opens the window and switches its one main tab.
- `ui.set` changes the values in the Controls panel the user sees.
- A pink **AI** pill at the top of the window says what happened ("AI: set tab = gear", "AI: capturing at 750×381",
  "AI: wants you to click Sell").
- A short pink ring labelled AI marks elements the agent targets (`ui.tree({ path })`, `ui.tweak`, `ui.click`).
  Rings are cleared before a capture, so they never end up in a screenshot.

Other sessions may drive the same window. Check `ui.status().mounted` before assuming your story is still open.

**Story names** can be a full name (`StarterPlayer.StarterPlayerScripts.TS.ui.crops.sell-page`), a source path
(`src/client/ui/crops/sell-page.story.tsx`), a partial path (`crops/sell-page`), a bare name (`sell-page`) or the
ModuleScript itself. Matching compares trailing path segments. An ambiguous name is an error that lists the candidates.

**`ui.open` options:**
- `controls`: control values to set once it mounts.
- `capture`: same values as `ui.capture`.
- `background` / `backgroundTransparency`: the capture backdrop.
- `widget = true`: mounts in its own dock window instead of the main panel (avoid this: the user isn't looking there). The result's `key` addresses it; close it
  with `ui.close(key)`.
- `show = false`: leaves the window closed (headless).
- `fresh = true`: remounts even if the story is already open.
- `timeout`: seconds to wait for the mount (default 8).

**Control values:**
- Choose takes one of its options (a string like `"3"` matches the number `3`).
- EnumList takes a key or a value.
- Color3 takes a `Color3` or a hex string.
- RGBA takes `{ Color, Transparency }` or a `Color3`.
- Number and Slider take numbers or numeric strings.

Unknown names and invalid options are errors that list what's valid.

**Errors as data.** `open`, `set` and `reload` return the warnings and errors from that call: story require errors,
mount and runtime errors from UI Labs, plus Output warnings and errors. Each looks like `{ kind, source, message }`.

## Capture mode (screenshots)

Studio's `screen_capture` renders the edit viewport with **StarterGui** but without CoreGui, which is why the stock
"View on Viewport" (CoreGui) is invisible to it. Capture mode works around this:

1. It mounts the story in a ScreenGui named `UILabsCapture` in StarterGui, with `Archivable = false` so it's never
   saved with the place or copied into playtests, and `DisplayOrder` 100000.
2. It puts the story in a centred frame over a solid backdrop. The frame is either the full viewport (`"fill"`) or a
   size: `"phone"` 750×381, `"phonePortrait"`, `"tablet"` 1024×768, `"laptop"` 1280×832, `"desktop"` 1920×1080, a
   `Vector2`, or `{ width, height }`.
3. When the size is bigger than the viewport, it scales the frame down with a UIScale to fit.

`ui.capture` returns:
- `viewport`: the viewport size.
- `frame`: the device frame rect.
- `content`: the bounds of the story's visible top-level elements.
- `scale`: the fit scale.

All rects are in viewport pixels. `screen_capture` images are in physical pixels, so multiply by
`imageWidth / viewport.width` before cropping.

Limitation: a story that scales itself from `workspace.CurrentCamera.ViewportSize` (a `px()` hook, for example) still
sees the real Studio viewport, not the frame size. Layouts built on scale or the parent's size do follow the frame.

`ui.capture(false)` (or the View on Viewport button) puts the story back in the window. Closing the story removes
the ScreenGui.

## Comments for AI

The story toolbar has a **Comment For AI** button (eyedropper, Shift+N):

1. Hover to highlight an element, click it, type a note, and press Enter (or Save).
2. Numbered pins mark the comments on their elements. Clicking a pin edits or deletes its comment.

Both **Select Elements** and **Comment For AI** also work on stories shown on the viewport (View On Viewport or
capture mode). While either tool is on, the plugin takes the viewport mouse, so clicks pick GUI elements instead of 3D
parts. A transparent click catcher sits over the story while a tool is on, so clicks don't press the story's own
buttons either. Turn the tool off, or pick another Studio tool, to give the mouse back. The highlight, pins and comment box are
drawn in CoreGui, so they never appear in `screen_capture` images.

Comments are stored in the plugin's settings, so they survive Studio restarts. Each one records:
- the story and the element's path from the story root (e.g. `SellWindow/Body/Frame[3]`);
- the element's class and its text (or the first text inside it);
- its rect, unaffected by zoom;
- the control values at the time;
- the note itself.

An agent reads them with `ui.comments()`. It can find the element again with `ui.tree({ path = comment.element })`
and resolve the comment with `ui.resolveComment(id)` once it's handled.

## Tweak properties

The story toolbar has a **Tweak Properties** button (palette icon, Shift+T). It works in the AI Labs window and on the
viewport.

1. Click an element. A panel lists the properties that element has:
   - Text, TextSize, TextColor3, FontWeight, alignment, TextScaled/Wrapped;
   - Size, Position, AnchorPoint, Rotation, ZIndex, Visible;
   - BackgroundColor3/Transparency, ImageColor3/Transparency, ScaleType;
   - its UICorner radius, UIStroke thickness/colour/transparency, UIPadding sides, UIListLayout padding, UIGridLayout
     cell size and padding, UIScale and UITextSizeConstraint.
2. Edit a value and press Enter (or click away). It applies live. Text formats:
   - colours: `#ff8800` or `255, 136, 0`;
   - UDim2: `{0.5, 10}, {0, 40}`, or `200, 40` for offsets;
   - UDim: `0, 8`, or `8` for an offset;
   - enums: the item name (`Center`, `Bold`).
3. Every change is recorded as a tweak:
   - story, element path, class, target (`""` or the child class, e.g. `UICorner`) and property;
   - the old value and the new one;
   - the story controls and viewport size at the time, so an agent can tell the phone layout from the desktop one;
   - `mode` (widget, viewport or agent).

   Changing the same property again updates the tweak and keeps the first old value.
4. Tweaks are stored in the plugin's settings and re-applied to mounted stories every 0.2 s. They survive remounts,
   reloads and Vide re-renders that overwrite a property. A brief flicker is possible when a re-render resets a value.
5. **Tweaked / Original** toggles between the tweaked and original values (`ui.showOriginal`). **Send to AI** bundles
   the element's tweaks, plus an optional note, into one comment.

An agent reads them with `ui.tweaks()`, writes the values into the source, then calls `ui.resolveTweak(id)`. The
recorded values were measured at the viewport size in `viewport`: a `px()`-scaled value has to be divided by the
story's scale at that size.

## Comments & tweaks panel (for the user)

The **Comments & tweaks** button under the story search, with a pink badge counting open items, opens a panel listing
every comment and tweak. They're grouped by story, newest first. Each row shows:
- the status: **Open**, **Seen** (an agent read it, "Seen by ..."), **In progress** (an agent claimed it) or **Done** (resolved), plus the agent's note;
- the element;
- the text, or `TextSize 12 → 16` for a tweak;
- when it was made.

The panel has these filters: **All**, **Open**, **Done** and **This story**. Clicking a row opens its story and
flashes the element. **Done** / **Reopen** and **✕** (delete) work per row. The panel updates live as agents claim and
resolve items.

**Page comments:** the **Page comment** button in the story toolbar (page icon, Shift+P), or **+ Page comment** in the panel header, leaves a note about the whole open story instead of one
element. These show "Whole page" in place of an element path, and clicking one opens the story without highlighting
anything. In `ui.comments()` they have `scope = "story"` and no `element`. Element comments have `scope = "element"`.
Both kinds carry the story `controls` and the `viewport` size when they were made. Seen, claim and resolve work the
same for both.

**Agent workflow:**
1. Read the open items with `ui.comments({ markSeen = true, by = "<session>" })` / `ui.tweaks({ markSeen = true, by = ... })`.
   That marks them **Seen**. Each one has `status` (`open`, `seen`, `in progress`, `done`), `note` and `seenBy`.
   Loggers such as the farm-tycoon watcher read without `markSeen`.
2. `ui.claimComment(id, "what you're about to do")`.
3. Make the change in code and check it (capture the story).
4. `ui.resolveComment(id, "what you changed")`.

The user sees each step in the panel and in the AI activity pill.

## GUI inset overlay

The **GUI Inset** toolbar button (expand icon, Shift+G), or `ui.inset()`, draws what a real client puts over the
screen. It's drawn on top of the story, doesn't take clicks, and shows up in captures:
- **The Roblox top bar band:** 58 px. On desktop it uses `GuiService.TopbarInset.Height` when Studio reports one, and
  58 when it doesn't. It has translucent mock buttons: logo, menu and chat on the left, settings on the right.
- **Phone landscape** (preview at most 1000×450, e.g. `"phone"` 750×381): the notch and rounded-corner safe areas,
  44 px on the left and right, and the home indicator, 21 px at the bottom.
- **Phone portrait** (taller than wide and at most 500 wide): a 47 px notch at the top and a 34 px home indicator.

The preview size is the capture frame when capturing, otherwise the story area at 100% zoom.

**Story code can't see it through GuiService.** A plugin can't override `GuiService:GetGuiInset()` or `TopbarInset`.
Instead, the story environment gets `GetGuiInset()`, which returns
`{ Device, Size, TopbarHeight, SafeArea, GuiInsetTopLeft, GuiInsetBottomRight }` while the overlay is on and `nil`
otherwise, and `GuiInsetChanged`, a signal. A game's inset hook can prefer it inside stories:

```ts
import { Environment } from "@rbxts/ui-labs";
const injection = Environment.GetEnvGlobalInjection() as { GetGuiInset?: () => { GuiInsetTopLeft: Vector2 } | undefined } | undefined;
const simulated = injection?.GetGuiInset?.();
const topLeft = simulated ? simulated.GuiInsetTopLeft : GuiService.GetGuiInset()[0];
```

## Shell helper

`tools/ailabs.py` wraps all of this around a Studio MCP client. By default it runs `python3 scripts/studio.py`; set
`$UILABS_STUDIO` to change that.

```bash
python3 tools/ailabs.py list sell
python3 tools/ailabs.py open crops/sell-page --controls '{"tab":"gear"}'
python3 tools/ailabs.py shot crops/sell-page --controls '{"tab":"seeds"}' --capture phone --out sell.png
python3 tools/ailabs.py comments
python3 tools/ailabs.py call tree '{"depth":3}'
```

`shot` opens the story (or reuses the open one), switches to capture mode, calls `screen_capture`, and crops to the
story's content (`--crop frame|none` to change that).

## Notes

- The bridge only exists in Edit mode, like UI Labs itself. Don't start playtests to use it.
- `open` always remounts, so a changed module is re-required: UI Labs' hot reloader requires clones, which sidesteps
  Studio's per-session `require` cache.
