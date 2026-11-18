import { CoreGui, RunService, Workspace } from "@rbxts/services";
import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import Configs from "Plugin/Configs";
import { RootProducer } from "Reflex";
import { GetEntryByKey } from "Reflex/StoryPreview";
import { GetGuisAtPosition } from "UI/StoryPanel/StoryTools/SelectElements/Utils";
import { ReloadEntry } from "UI/StoryPreview/Utils";

import { AgentControlHandle, GetControlHandle } from "./AgentRegistry";
import { AgentLogEntry, AgentLogSince } from "./AgentLog";
import { AgentComment, DeleteComments, FindElementByPath, GetComments, GetElementPath, UpdateComment } from "./AgentComments";
import { ClearFlashes, FlashElement, PushActivity } from "./AgentActivity";
import { AddPageComment } from "./AgentPageComment";
import { GetSimulatedInset } from "./AgentInset";
import { API_SOURCE } from "./AgentApiSource";
import {
	AgentTweak,
	DeleteTweaks,
	EncodeOrString,
	GetTargetInstance,
	GetTweaks,
	IsShowingOriginal,
	ReadProperty,
	RecordTweak,
	SetShowOriginal,
	UpdateTweak,
	WriteProperty
} from "./AgentTweaks";
import { FormatEncoded, FormatValue, ParseValue } from "./AgentValues";

// Scriptable API for AI agents / scripts (e.g. Studio MCP execute_luau, the command bar).
// A Folder "AILabs" in CoreGui holds a BindableFunction "Invoke" (works across plugin/command-bar VMs) and a
// ModuleScript "API" wrapping it:  local ui = require(game:GetService("CoreGui").AILabs.API)

export const AGENT_FOLDER_NAME = "AILabs";
export const AGENT_BUILD = "2026-11-17.11";

export const CapturePresets: Record<string, Vector2 | undefined> = {
	fill: undefined,
	phone: new Vector2(750, 381),
	phonePortrait: new Vector2(381, 750),
	tablet: new Vector2(1024, 768),
	desktop: new Vector2(1920, 1080),
	laptop: new Vector2(1280, 832)
};

interface BridgeOptions {
	Plugin: Plugin;
	DockWidget: DockWidgetPluginGui;
	EnsureRoot: () => void;
}

type Args = Record<string, unknown>;

let lastKey: string = Configs.RootPreviewKey;

// ---------------------------------------------------------------------------------------------------- helpers

function Fail(message: string): never {
	error(message, 0);
}

function WaitUntil(check: () => boolean, timeout: number) {
	const start = os.clock();
	while (!check()) {
		if (os.clock() - start > timeout) return false;
		task.wait();
	}
	return true;
}

function Settle(frames = 3) {
	for (let i = 0; i < frames; i++) RunService.Heartbeat.Wait();
}

function GetStoryModules() {
	return RootProducer.getState().moduleList.story.list;
}

function StoryName(module: ModuleScript) {
	return RemoveExtension(module.Name, Configs.Extensions.Story);
}

function StoryPath(module: ModuleScript) {
	return module.GetFullName();
}

function StorybookOf(module: ModuleScript) {
	const node = RootProducer.getState().explorer.nodes.nodemap.get(module);
	let parent: ContainerNode | ParentNode | undefined = node?.Parent;
	while (parent) {
		if (parent.Type === "Storybook") return parent.Name;
		if (parent.Type === "Unknown") return undefined;
		parent = parent.Parent;
	}
	return undefined;
}

/** Splits "src/client/ui/crops/sell-page.story.tsx" or "TS.ui.crops.sell-page" into lowercase segments. */
function Segments(query: string) {
	let cleaned = query.lower();
	for (const ext of [".tsx", ".ts", ".luau", ".lua"]) {
		if (cleaned.sub(-ext.size()) === ext) cleaned = cleaned.sub(1, -ext.size() - 1);
	}
	if (cleaned.sub(-6) === ".story") cleaned = cleaned.sub(1, -7);
	const parts: string[] = [];
	for (const [part] of cleaned.gmatch("[^/%.\\]+")) parts.push(part as string);
	return parts;
}

function ModuleSegments(module: ModuleScript) {
	const parts: string[] = [StoryName(module).lower()];
	let current = module.Parent;
	while (current && current !== game) {
		parts.unshift(current.Name.lower());
		current = current.Parent;
	}
	return parts;
}

function FindStory(query: string | ModuleScript) {
	const modules = GetStoryModules();
	if (typeIs(query, "Instance")) {
		if (modules.includes(query)) return query;
		Fail(`'${query.GetFullName()}' is not a story AI Labs found`);
	}
	for (const module of modules) {
		if (module.GetFullName() === query) return module;
	}
	const wanted = Segments(query);
	if (wanted.isEmpty()) Fail("empty story query");

	let best: ModuleScript[] = [];
	let bestScore = 0;
	for (const module of modules) {
		const have = ModuleSegments(module);
		if (have[have.size() - 1] !== wanted[wanted.size() - 1]) continue;
		let score = 0;
		// count trailing segments that match (in order), skipping query segments that aren't in the tree (src, client)
		let hi = have.size() - 1;
		for (let wi = wanted.size() - 1; wi >= 0 && hi >= 0; wi--) {
			if (have[hi] === wanted[wi]) {
				score++;
				hi--;
			}
		}
		if (score > bestScore) {
			best = [module];
			bestScore = score;
		} else if (score === bestScore) {
			best.push(module);
		}
	}
	if (best.size() === 1) return best[0];
	if (best.isEmpty()) Fail(`no story matches '${query}' (try ui.list("${wanted[wanted.size() - 1]}"))`);
	Fail(`'${query}' is ambiguous: ${best.map((m) => m.GetFullName()).join(", ")}`);
}

function GetEntry(key?: string) {
	const previews = RootProducer.getState().storyPreview.mountPreviews;
	const entry = GetEntryByKey(previews, key ?? lastKey) ?? (key === undefined ? previews.get(Configs.RootPreviewKey) : undefined);
	if (!entry) Fail(key !== undefined ? `no mounted story with key '${key}'` : "no story is open (ui.open first)");
	return entry;
}

function Serialize(value: unknown, depth = 0): unknown {
	if (typeIs(value, "function")) return "<function>";
	if (typeIs(value, "thread") || typeIs(value, "userdata")) return tostring(value);
	if (typeIs(value, "table")) {
		if (depth > 4) return "<table>";
		const out: Record<string, unknown> = {};
		for (const [k, v] of pairs(value as Record<string, unknown>)) out[tostring(k)] = Serialize(v, depth + 1);
		return out;
	}
	return value;
}

function DescribeControls(controls: Record<string, unknown>, values: Record<string, unknown>) {
	const out: Record<string, unknown> = {};
	for (const [name, raw] of pairs(controls)) {
		const control = raw as Record<string, unknown>;
		const value = values[name as string];
		if (control.EntryType === "ControlGroup") {
			out[name as string] = {
				type: "Group",
				controls: DescribeControls(control.Controls as Record<string, unknown>, (value ?? {}) as Record<string, unknown>)
			};
			continue;
		}
		const info: Record<string, unknown> = { type: control.Type, value: Serialize(value) };
		if (control.Type === "Choose") info.options = Serialize(control.List);
		if (control.Type === "EnumList") info.options = Serialize(control.List);
		if (control.Type === "Slider") {
			info.min = control.Min;
			info.max = control.Max;
			info.step = control.Step;
		}
		out[name as string] = info;
	}
	return out;
}

function CoerceValue(name: string, control: Record<string, unknown>, value: unknown): unknown {
	const controlType = control.Type as string;
	if (controlType === "Choose") {
		const list = control.List as defined[];
		if (list.includes(value as defined)) return value;
		// allow strings for non-string options (e.g. numbers)
		for (const option of list) if (tostring(option) === tostring(value)) return option;
		Fail(`control '${name}': ${tostring(value)} is not an option (${list.map((v) => tostring(v)).join(", ")})`);
	}
	if (controlType === "EnumList") {
		const list = control.List as Record<string, unknown>;
		if (typeIs(value, "string") && list[value] !== undefined) return list[value];
		for (const [, option] of pairs(list)) if (option === value) return option;
		const keys: string[] = [];
		for (const [k] of pairs(list)) keys.push(k as string);
		Fail(`control '${name}': ${tostring(value)} is not an option (${keys.join(", ")})`);
	}
	if (controlType === "Number" || controlType === "Slider") {
		const n = tonumber(value);
		if (n === undefined) Fail(`control '${name}' wants a number, got ${typeOf(value)}`);
		return n;
	}
	if (controlType === "Boolean") {
		if (typeIs(value, "boolean")) return value;
		if (value === "true") return true;
		if (value === "false") return false;
		Fail(`control '${name}' wants a boolean, got ${typeOf(value)}`);
	}
	if (controlType === "String") return tostring(value);
	if (controlType === "Color3" && typeIs(value, "string")) {
		const [ok, color] = pcall(() => Color3.fromHex(value));
		if (ok) return color;
	}
	if (controlType === "RGBA" && typeIs(value, "Color3")) {
		return { Color: value, Transparency: 0 };
	}
	return value;
}

function MergeValues(
	controls: Record<string, unknown>,
	current: Record<string, unknown>,
	changes: Record<string, unknown>,
	prefix = ""
) {
	const merged = table.clone(current);
	for (const [name, value] of pairs(changes)) {
		const control = controls[name as string] as Record<string, unknown> | undefined;
		if (!control) {
			const names: string[] = [];
			for (const [k] of pairs(controls)) names.push(k as string);
			Fail(`no control '${prefix}${name}' (controls: ${names.join(", ")})`);
		}
		if (control.EntryType === "ControlGroup") {
			if (!typeIs(value, "table")) Fail(`control group '${prefix}${name}' wants a table`);
			merged[name as string] = MergeValues(
				control.Controls as Record<string, unknown>,
				(current[name as string] ?? {}) as Record<string, unknown>,
				value as Record<string, unknown>,
				`${prefix}${name}.`
			);
		} else {
			merged[name as string] = CoerceValue(`${prefix}${name}`, control, value);
		}
	}
	return merged;
}

function GetCaptureSize(capture: unknown): Vector2 | undefined | false {
	if (capture === undefined || capture === false) return false;
	if (capture === true || capture === "fill") return undefined;
	if (typeIs(capture, "string")) {
		if (!(capture in CapturePresets)) {
			const names: string[] = [];
			for (const [k] of pairs(CapturePresets)) names.push(k as string);
			Fail(`unknown capture preset '${capture}' (${names.join(", ")})`);
		}
		return CapturePresets[capture];
	}
	if (typeIs(capture, "Vector2")) return capture;
	if (typeIs(capture, "table")) {
		const t = capture as Record<string | number, number>;
		const w = t.width ?? t.w ?? t.X ?? t[1];
		const h = t.height ?? t.h ?? t.Y ?? t[2];
		if (w !== undefined && h !== undefined) return new Vector2(w, h);
	}
	Fail("capture must be a preset name, Vector2, {width, height}, true or false");
}

function Rect(gui: GuiObject, origin?: Vector2) {
	const pos = origin ? gui.AbsolutePosition.sub(origin) : gui.AbsolutePosition;
	return {
		x: math.round(pos.X),
		y: math.round(pos.Y),
		width: math.round(gui.AbsoluteSize.X),
		height: math.round(gui.AbsoluteSize.Y)
	};
}

function StoryBounds(holder: Frame) {
	// union of visible top-level GuiObjects (the story's content), falling back to the holder
	let minX = math.huge,
		minY = math.huge,
		maxX = -math.huge,
		maxY = -math.huge;
	for (const child of holder.GetChildren()) {
		if (!child.IsA("GuiObject") || !child.Visible) continue;
		const p = child.AbsolutePosition;
		const s = child.AbsoluteSize;
		minX = math.min(minX, p.X);
		minY = math.min(minY, p.Y);
		maxX = math.max(maxX, p.X + s.X);
		maxY = math.max(maxY, p.Y + s.Y);
	}
	if (minX === math.huge) return Rect(holder);
	return { x: math.round(minX), y: math.round(minY), width: math.round(maxX - minX), height: math.round(maxY - minY) };
}

function CaptureInfo(entry: PreviewEntry) {
	const holder = entry.Holder;
	const camera = Workspace.CurrentCamera;
	const viewport = camera ? camera.ViewportSize : Vector2.zero;
	if (!holder || entry.Capture === undefined) return undefined;
	const frame = holder.Parent?.Parent as Frame | undefined; // MountFrame -> Holder Div -> Frame
	const scale = frame?.FindFirstChildOfClass("UIScale")?.Scale ?? 1;
	return {
		// Rects are in viewport pixels (screen_capture images may be larger by the display scale: compare widths)
		viewport: { width: viewport.X, height: viewport.Y },
		frame: frame && frame.IsA("GuiObject") ? Rect(frame) : undefined,
		content: StoryBounds(holder),
		scale: scale,
		size: entry.Capture.Size ? { width: entry.Capture.Size.X, height: entry.Capture.Size.Y } : "fill"
	};
}

function DescribeTree(root: Instance, maxDepth: number, maxNodes: number) {
	const origin = root.IsA("GuiObject") ? root.AbsolutePosition : Vector2.zero;
	let count = 0;
	const visit = (instance: Instance, depth: number): Record<string, unknown> | undefined => {
		if (count >= maxNodes) return undefined;
		count++;
		const node: Record<string, unknown> = { name: instance.Name, class: instance.ClassName };
		if (instance.IsA("GuiObject")) {
			node.rect = Rect(instance, origin);
			if (!instance.Visible) node.visible = false;
			if (instance.IsA("TextLabel") || instance.IsA("TextButton") || instance.IsA("TextBox")) {
				node.text = instance.ContentText !== "" ? instance.ContentText : instance.Text;
				if (instance.TextFits === false) node.textFits = false;
			}
			if ((instance.IsA("ImageLabel") || instance.IsA("ImageButton")) && instance.Image !== "") {
				node.image = instance.Image;
				if (!instance.IsLoaded) node.imageLoaded = false;
			}
		}
		if (depth < maxDepth) {
			const children: Record<string, unknown>[] = [];
			for (const child of instance.GetChildren()) {
				if (!child.IsA("GuiObject") && !child.IsA("Folder") && !child.IsA("LayerCollector")) continue;
				const described = visit(child, depth + 1);
				if (described) children.push(described);
			}
			if (!children.isEmpty()) node.children = children;
		} else if (!instance.GetChildren().isEmpty()) {
			node.more = instance.GetChildren().size();
		}
		return node;
	};
	const tree = visit(root, 0);
	return { tree, nodes: count, truncated: count >= maxNodes };
}

function InsetData(entry: PreviewEntry) {
	const inset = GetSimulatedInset(entry);
	if (!inset) return undefined;
	return {
		device: inset.Device,
		topbar: inset.TopbarHeight,
		safeArea: {
			left: inset.SafeArea.Left,
			right: inset.SafeArea.Right,
			top: inset.SafeArea.Top,
			bottom: inset.SafeArea.Bottom
		},
		size: { width: math.round(inset.Size.X), height: math.round(inset.Size.Y) }
	};
}

function SetInset(key: string, on: boolean) {
	RootProducer.updateMountData(key, (old) => ({ ...old, ShowInset: on }));
	Settle(3);
}

function SummarizeEntry(entry: PreviewEntry) {
	const handle = GetControlHandle(entry.Key);
	return {
		key: entry.Key,
		uid: entry.UID,
		story: StoryPath(entry.Module),
		name: StoryName(entry.Module),
		onWidget: entry.OnWidget,
		onViewport: entry.OnViewport,
		capture: CaptureInfo(entry),
		inset: InsetData(entry),
		mounted: entry.Holder !== undefined && !entry.Holder.GetChildren().isEmpty(),
		controls: handle ? DescribeControls(handle.Controls, handle.Values) : undefined
	};
}

function FormatLogs(logs: AgentLogEntry[]) {
	return logs.map((log) => ({ kind: log.Kind, source: log.Source, message: log.Message }));
}

function CommentToData(comment: AgentComment) {
	return {
		id: comment.Id,
		story: comment.Story,
		storyName: comment.StoryName,
		element: comment.Scope === "story" ? undefined : comment.Element,
		scope: comment.Scope ?? "element",
		viewport: comment.Viewport ? { width: comment.Viewport.Width, height: comment.Viewport.Height } : undefined,
		elementClass: comment.ElementClass,
		elementText: comment.ElementText,
		rect: comment.Rect,
		text: comment.Text,
		controls: comment.Controls,
		created: comment.Created,
		resolved: comment.Resolved,
		status: comment.Resolved ? "done" : comment.Claimed ? "in progress" : comment.Seen ? "seen" : "open",
		note: comment.Note,
		seenAt: comment.SeenAt,
		seenBy: comment.SeenBy
	};
}

function TweakToData(tweak: AgentTweak) {
	return {
		id: tweak.Id,
		story: tweak.Story,
		storyName: tweak.StoryName,
		element: tweak.Element,
		elementClass: tweak.ElementClass,
		elementText: tweak.ElementText,
		target: tweak.Target,
		property: tweak.Property,
		old: FormatEncoded(tweak.Old),
		new: FormatEncoded(tweak.New),
		oldValue: tweak.Old,
		newValue: tweak.New,
		controls: tweak.Controls,
		viewport: { width: tweak.Viewport.Width, height: tweak.Viewport.Height },
		mode: tweak.Mode,
		created: tweak.Created,
		updated: tweak.Updated,
		resolved: tweak.Resolved,
		status: tweak.Resolved ? "done" : tweak.Claimed ? "in progress" : tweak.Seen ? "seen" : "open",
		note: tweak.Note,
		seenAt: tweak.SeenAt,
		seenBy: tweak.SeenBy
	};
}

// ---------------------------------------------------------------------------------------------------- argument checks

let currentCommand = "?";

function ArgFail(name: string, expected: string, value: unknown): never {
	Fail(`${currentCommand}: expected ${expected} for '${name}', got ${typeOf(value)}`);
}
function OptStr(args: Args, name: string) {
	const value = args[name];
	if (value === undefined || typeIs(value, "string")) return value as string | undefined;
	ArgFail(name, "a string", value);
}
function ReqStr(args: Args, name: string) {
	const value = OptStr(args, name);
	if (value === undefined) ArgFail(name, "a string", value);
	return value;
}
function OptNum(args: Args, name: string) {
	const value = args[name];
	if (value === undefined || typeIs(value, "number")) return value as number | undefined;
	ArgFail(name, "a number", value);
}
function OptBool(args: Args, name: string) {
	const value = args[name];
	if (value === undefined || typeIs(value, "boolean")) return value as boolean | undefined;
	ArgFail(name, "a boolean", value);
}
function OptColor(args: Args, name: string) {
	const value = args[name];
	if (value === undefined || typeIs(value, "Color3")) return value as Color3 | undefined;
	ArgFail(name, "a Color3", value);
}
function ReqTable(args: Args, name: string) {
	const value = args[name];
	if (typeIs(value, "table")) return value as Record<string, unknown>;
	ArgFail(name, "a table", value);
}
function OptTable(args: Args, name: string) {
	if (args[name] === undefined) return undefined;
	return ReqTable(args, name);
}
function ReqStory(args: Args): string | ModuleScript {
	const value = args.story;
	if (typeIs(value, "string") && value !== "") return value;
	if (typeIs(value, "Instance") && value.IsA("ModuleScript")) return value;
	ArgFail("story", "a story name/path string or ModuleScript", value);
}

// ---------------------------------------------------------------------------------------------------- commands

function WaitForMount(key: string, since: number, timeout: number) {
	WaitUntil(() => {
		const previews = RootProducer.getState().storyPreview.mountPreviews;
		const entry = GetEntryByKey(previews, key);
		if (!entry) return true; // unmounted (story closed itself?)
		if (GetControlHandle(entry.Key)) return true;
		if (entry.Holder && !entry.Holder.GetChildren().isEmpty()) return true;
		// stop early when the story failed to load
		return AgentLogSince(since).some((log) => log.Source === "uilabs");
	}, timeout);
	Settle(4);
}

function SetCapture(key: string, capture: unknown, args: Args) {
	const size = GetCaptureSize(capture);
	RootProducer.updateMountData(key, (old) => {
		if (size === false) {
			return { ...old, Capture: undefined, OnViewport: OptBool(args, "viewport") ?? false };
		}
		return {
			...old,
			OnViewport: true,
			Capture: {
				Size: size,
				Background: OptColor(args, "background"),
				BackgroundTransparency: OptNum(args, "backgroundTransparency")
			}
		};
	});
	Settle(4);
}

function SetControls(key: string, changes: Record<string, unknown>) {
	let handle: AgentControlHandle | undefined;
	WaitUntil(() => {
		handle = GetControlHandle(key);
		return handle !== undefined;
	}, 5);
	if (!handle) Fail("the story has no controls (or hasn't mounted)");
	const merged = MergeValues(handle.Controls, handle.Values, changes);
	handle.SetValues(merged as ParametrizedControls);
	WaitUntil(() => GetControlHandle(key)?.Values === merged, 2);
	Settle(3);
}

function ResolveKey(args: Args) {
	const entry = GetEntry(OptStr(args, "key"));
	return entry.Key;
}

export function StartAgentBridge(options: BridgeOptions) {
	const commands: Record<string, (args: Args) => unknown> = {
		status: () => {
			const previews: defined[] = [];
			RootProducer.getState().storyPreview.mountPreviews.forEach((entry) => previews.push(SummarizeEntry(entry)));
			return {
				version: `${Configs.Version.Mayor}.${Configs.Version.Minor}.${Configs.Version.Fix}`,
				build: AGENT_BUILD,
				windowOpen: options.DockWidget.Enabled,
				tool: RootProducer.getState().interface.tweakTool
					? "tweak"
					: RootProducer.getState().interface.commentTool
					? "comment"
					: RootProducer.getState().interface.selectTool
						? "select"
						: "none",
				stories: GetStoryModules().size(),
				mounted: previews,
				comments: GetComments().filter((c) => !c.Resolved).size(),
				tweaks: GetTweaks().filter((t) => !t.Resolved).size(),
				showingOriginal: IsShowingOriginal(),
				presets: Serialize(CapturePresets)
			};
		},

		list: (args) => {
			const filter = OptStr(args, "filter")?.lower();
			const out: defined[] = [];
			for (const module of GetStoryModules()) {
				const path = StoryPath(module);
				if (filter !== undefined && path.lower().find(filter, 1, true)[0] === undefined) continue;
				out.push({ path, name: StoryName(module), storybook: StorybookOf(module) });
			}
			return out;
		},

		tool: (args) => {
			const name = OptStr(args, "name") ?? "none";
			if (name !== "select" && name !== "comment" && name !== "tweak" && name !== "none")
				Fail("tool must be select, comment, tweak or none");
			RootProducer.setSelectTool(name === "select");
			RootProducer.setCommentTool(name === "comment");
			RootProducer.setTweakTool(name === "tweak");
			Settle(2);
			return { tool: name };
		},

		window: (args) => {
			if (args.open !== undefined) options.DockWidget.Enabled = OptBool(args, "open")!;
			return { windowOpen: options.DockWidget.Enabled };
		},

		open: (args) => {
			const since = os.clock();
			const module = FindStory(ReqStory(args));
			// agents work in the user's own AI Labs window so they can see what happens (show = false to stay hidden)
			if (OptBool(args, "show") !== false) options.DockWidget.Enabled = true;
			const root = RootProducer.getState().storyPreview.mountPreviews.get(Configs.RootPreviewKey);
			const reuse = args.widget !== true && OptBool(args, "fresh") !== true && root !== undefined && root.Module === module;

			let key: string;
			if (args.widget === true) {
				const before = new Set<string>();
				RootProducer.getState().storyPreview.mountPreviews.forEach((e) => before.add(e.UID));
				RootProducer.mountOnWidget(module);
				let found: string | undefined;
				RootProducer.getState().storyPreview.mountPreviews.forEach((e) => {
					if (!before.has(e.UID)) found = e.Key;
				});
				key = found!;
			} else if (reuse) {
				// already open in the user's tab: keep it (and its control values); fresh = true remounts
				key = Configs.RootPreviewKey;
				RootProducer.selectStory(Configs.RootPreviewKey);
			} else {
				// switch the main tab to this story (never piles up tabs)
				RootProducer.unmountStory(Configs.RootPreviewKey);
				Settle(2);
				RootProducer.mountStory(module, false);
				RootProducer.selectStory(Configs.RootPreviewKey);
				key = Configs.RootPreviewKey;
			}
			lastKey = key;
			PushActivity(`${reuse ? "using" : "opened"} ${StoryName(module)}`);
			WaitForMount(key, since, OptNum(args, "timeout") ?? 8);

			const controls = OptTable(args, "controls");
			if (controls !== undefined) SetControls(key, controls);
			const openInset = OptBool(args, "inset");
			if (openInset !== undefined) SetInset(key, openInset);
			if (args.capture !== undefined && args.capture !== false) SetCapture(key, args.capture, args);

			return { ...SummarizeEntry(GetEntry(key)), logs: FormatLogs(AgentLogSince(since)) };
		},

		close: (args) => {
			PushActivity("closed the story");
			if (args.key === "all") {
				RootProducer.getState().storyPreview.mountPreviews.forEach((e) => RootProducer.unmountByUID(e.UID));
			} else {
				RootProducer.unmountByUID(GetEntry(OptStr(args, "key")).UID);
			}
			Settle(2);
			return { closed: true };
		},

		controls: (args) => {
			const entry = GetEntry(OptStr(args, "key"));
			const handle = GetControlHandle(entry.Key);
			return handle ? DescribeControls(handle.Controls, handle.Values) : {};
		},

		set: (args) => {
			const since = os.clock();
			const key = ResolveKey(args);
			SetControls(key, ReqTable(args, "controls"));
			const handle = GetControlHandle(key)!;
			const shown: string[] = [];
			for (const [name, value] of pairs(ReqTable(args, "controls"))) shown.push(`${name} = ${tostring(value)}`);
			PushActivity(`set ${shown.join(", ")}`);
			return { controls: DescribeControls(handle.Controls, handle.Values), logs: FormatLogs(AgentLogSince(since)) };
		},

		reload: (args) => {
			const since = os.clock();
			const entry = GetEntry(OptStr(args, "key"));
			const oldHandle = GetControlHandle(entry.Key);
			PushActivity(`reloaded ${StoryName(entry.Module)}`);
			ReloadEntry(entry);
			WaitUntil(() => GetControlHandle(entry.Key) !== oldHandle, 5);
			WaitForMount(entry.Key, since, 5);
			return { ...SummarizeEntry(GetEntry(entry.Key)), logs: FormatLogs(AgentLogSince(since)) };
		},

		capture: (args) => {
			const key = ResolveKey(args);
			ClearFlashes();
			const insetArg = OptBool(args, "inset");
			if (insetArg !== undefined) SetInset(key, insetArg);
			SetCapture(key, args.capture ?? "fill", args);
			const entry = GetEntry(key);
			const info = CaptureInfo(entry);
			if (info) {
				const size = info.size;
				PushActivity(
					typeIs(size, "table")
						? `capturing at ${(size as { width: number }).width}x${(size as { height: number }).height}`
						: "capturing (full viewport)"
				);
			} else {
				PushActivity("back to the AI Labs window");
			}
			return info ?? { capture: false };
		},

		inset: (args) => {
			const key = ResolveKey(args);
			const on = OptBool(args, "on") ?? true;
			SetInset(key, on);
			PushActivity(on ? "showing the GUI inset" : "hid the GUI inset");
			return { inset: InsetData(GetEntry(key)) ?? false };
		},

		zoom: (args) => {
			const key = ResolveKey(args);
			RootProducer.setZoom(key, OptNum(args, "zoom") ?? 100);
			if (args.reset === true) RootProducer.setMountData(key, { Offset: Vector2.zero });
			Settle(2);
			return { zoom: GetEntry(key).Zoom };
		},

		tree: (args) => {
			const entry = GetEntry(OptStr(args, "key"));
			if (!entry.Holder) Fail("story has no holder yet");
			let root: Instance = entry.Holder;
			if (args.path !== undefined) {
				const found = FindElementByPath(entry.Holder, ReqStr(args, "path"));
				if (!found) Fail(`no element at '${args.path}'`);
				root = found;
				if (OptBool(args, "flash") !== false && found.IsA("GuiObject")) FlashElement(found, entry.ListenerFrame);
			}
			return DescribeTree(root, OptNum(args, "depth") ?? 6, OptNum(args, "maxNodes") ?? 400);
		},

		logs: (args) => FormatLogs(AgentLogSince(OptNum(args, "since") ?? 0)),

		comments: (args) => {
			const story = OptStr(args, "story");
			let module: ModuleScript | undefined;
			if (story !== undefined) module = FindStory(story);
			const list = GetComments()
				.filter((c) => (args.all === true ? true : !c.Resolved))
				.filter((c) => (module ? c.Story === module.GetFullName() : true));
			if (OptBool(args, "markSeen") === true) {
				const by = OptStr(args, "by");
				for (const c of list) if (!c.Seen && !c.Resolved) UpdateComment(c.Id, { Seen: true, SeenAt: os.time(), SeenBy: by });
				const fresh = GetComments();
				return list.map((c) => CommentToData(fresh.find((f) => f.Id === c.Id) ?? c));
			}
			return list.map(CommentToData);
		},

		resolveComment: (args) => {
			const resolved = OptBool(args, "resolved") ?? true;
			const note = OptStr(args, "note");
			const updated = UpdateComment(ReqStr(args, "id"), {
				Resolved: resolved,
				Claimed: resolved ? true : false,
				...(resolved ? {} : { Seen: false }),
				ResolvedAt: resolved ? os.time() : undefined,
				...(note !== undefined ? { Note: note } : {})
			});
			if (!updated) Fail(`resolveComment: no comment '${args.id}'`);
			PushActivity(resolved ? `done: ${updated.Text.sub(1, 40)}` : `reopened: ${updated.Text.sub(1, 40)}`);
			return CommentToData(updated);
		},

		tweaks: (args) => {
			const story = OptStr(args, "story");
			let module: ModuleScript | undefined;
			if (story !== undefined) module = FindStory(story);
			const list = GetTweaks()
				.filter((t) => (OptBool(args, "all") === true ? true : !t.Resolved))
				.filter((t) => (module ? t.Story === module.GetFullName() : true));
			if (OptBool(args, "markSeen") === true) {
				const by = OptStr(args, "by");
				for (const t of list) if (!t.Seen && !t.Resolved) UpdateTweak(t.Id, { Seen: true, SeenAt: os.time(), SeenBy: by });
				const fresh = GetTweaks();
				return list.map((t) => TweakToData(fresh.find((f) => f.Id === t.Id) ?? t));
			}
			return list.map(TweakToData);
		},

		tweak: (args) => {
			const entry = GetEntry(OptStr(args, "key"));
			if (!entry.Holder) Fail("tweak: story has no holder yet");
			const path = ReqStr(args, "element");
			const property = ReqStr(args, "property");
			const target = OptStr(args, "target") ?? "";
			const element = FindElementByPath(entry.Holder, path);
			if (!element) Fail(`tweak: no element at '${path}'`);
			const instance = GetTargetInstance(element, target);
			if (!instance) Fail(`tweak: '${path}' has no ${target}`);
			const [ok, current] = ReadProperty(instance, property);
			if (!ok) Fail(`tweak: ${instance.ClassName} has no property '${property}'`);
			let value = args.value;
			if (typeIs(value, "string") && !typeIs(current, "string")) value = ParseValue(value, current);
			if (value === undefined || typeOf(value) !== typeOf(current))
				Fail(`tweak: '${tostring(args.value)}' isn't a valid ${typeOf(current)} (current ${FormatValue(current)})`);
			if (!WriteProperty(instance, property, value)) Fail(`tweak: couldn't set ${property}`);
			if (element.IsA("GuiObject")) FlashElement(element, entry.ListenerFrame, `AI: ${property}`);
			PushActivity(`tweaked ${element.Name}.${property} = ${FormatValue(value)}`);
			const camera = Workspace.CurrentCamera;
			const handle = GetControlHandle(entry.Key);
			const flat: Record<string, string> = {};
			if (handle) for (const [k, v] of pairs(handle.Values)) flat[k as string] = tostring(v);
			return TweakToData(
				RecordTweak({
					Story: entry.Module.GetFullName(),
					StoryName: StoryName(entry.Module),
					Element: path,
					ElementClass: element.ClassName,
					Target: target,
					Property: property,
					Old: EncodeOrString(current),
					New: EncodeOrString(value),
					Controls: flat,
					Viewport: {
						Width: camera ? math.round(camera.ViewportSize.X) : 0,
						Height: camera ? math.round(camera.ViewportSize.Y) : 0
					},
					Mode: "agent"
				})
			);
		},

		click: (args) => {
			const entry = GetEntry(OptStr(args, "key"));
			const holder = entry.Holder;
			if (!holder) Fail("click: story has no holder yet");
			let target: Instance | undefined;
			const path = OptStr(args, "element");
			if (path !== undefined) {
				target = FindElementByPath(holder, path);
				if (!target) Fail(`click: no element at '${path}'`);
			} else {
				const x = OptNum(args, "x");
				const y = OptNum(args, "y");
				if (x === undefined || y === undefined) Fail("click: pass element = path, or x and y (relative to the story)");
				target = GetGuisAtPosition(holder, holder.AbsolutePosition.add(new Vector2(x, y)))[0];
				if (!target) Fail(`click: nothing at ${x}, ${y}`);
			}
			// the nearest button or text box at or above the target
			let control: Instance | undefined = target;
			while (control && control !== holder && !control.IsA("GuiButton") && !control.IsA("TextBox")) {
				control = control.Parent;
			}
			const shownName = (gui: Instance) =>
				gui.IsA("TextButton") || gui.IsA("TextLabel") || gui.IsA("TextBox") ? `${gui.Name} "${gui.ContentText}"` : gui.Name;
			const text = OptStr(args, "text");
			if (control && control.IsA("TextBox")) {
				FlashElement(control, entry.ListenerFrame, "AI: typing");
				if (text !== undefined) {
					control.Text = text;
					control.CaptureFocus();
					control.ReleaseFocus(OptBool(args, "submit") ?? true);
				}
				PushActivity(text !== undefined ? `typed "${text}" into ${control.Name}` : `focused ${control.Name}`);
				Settle(3);
				return { clicked: true, element: GetElementPath(holder, control), class: "TextBox", text: control.Text };
			}
			const flashTarget = (control && control !== holder ? control : target) as GuiObject;
			FlashElement(flashTarget, entry.ListenerFrame, "AI: please click here", 5);
			PushActivity(`wants you to click ${shownName(flashTarget)}`);
			return {
				clicked: false,
				element: GetElementPath(holder, flashTarget),
				class: flashTarget.ClassName,
				reason:
					"Studio doesn't let plugins press buttons in Edit mode (VirtualInputManager needs RobloxScript), so it's highlighted for the user to click. Prefer story controls for state, or type into TextBoxes with text = ..."
			};
		},

		resolveTweak: (args) => {
			const resolved = OptBool(args, "resolved") ?? true;
			const note = OptStr(args, "note");
			const updated = UpdateTweak(ReqStr(args, "id"), {
				Resolved: resolved,
				Claimed: resolved ? true : false,
				...(resolved ? {} : { Seen: false }),
				ResolvedAt: resolved ? os.time() : undefined,
				...(note !== undefined ? { Note: note } : {})
			});
			if (!updated) Fail(`resolveTweak: no tweak '${args.id}'`);
			PushActivity(`${resolved ? "done" : "reopened"}: tweak ${updated.Property}`);
			return TweakToData(updated);
		},

		addComment: (args) => {
			const entry = GetEntry(OptStr(args, "key"));
			const added = AddPageComment(entry, ReqStr(args, "text"));
			if (!added) Fail("addComment: text is empty");
			PushActivity(`page comment: ${added.Text.sub(1, 40)}`);
			return CommentToData(added);
		},

		seenComment: (args) => {
			const updated = UpdateComment(ReqStr(args, "id"), { Seen: true, SeenAt: os.time(), SeenBy: OptStr(args, "by") });
			if (!updated) Fail(`seenComment: no comment '${args.id}'`);
			PushActivity(`read: ${updated.Text.sub(1, 40)}`);
			return CommentToData(updated);
		},

		seenTweak: (args) => {
			const updated = UpdateTweak(ReqStr(args, "id"), { Seen: true, SeenAt: os.time(), SeenBy: OptStr(args, "by") });
			if (!updated) Fail(`seenTweak: no tweak '${args.id}'`);
			PushActivity(`read: tweak ${updated.Property}`);
			return TweakToData(updated);
		},

		claimComment: (args) => {
			const updated = UpdateComment(ReqStr(args, "id"), {
				Claimed: true,
				ClaimedAt: os.time(),
				Seen: true,
				Note: OptStr(args, "note")
			});
			if (!updated) Fail(`claimComment: no comment '${args.id}'`);
			PushActivity(`working on: ${updated.Text.sub(1, 40)}`);
			return CommentToData(updated);
		},

		claimTweak: (args) => {
			const updated = UpdateTweak(ReqStr(args, "id"), {
				Claimed: true,
				ClaimedAt: os.time(),
				Seen: true,
				Note: OptStr(args, "note")
			});
			if (!updated) Fail(`claimTweak: no tweak '${args.id}'`);
			PushActivity(`working on: tweak ${updated.Property}`);
			return TweakToData(updated);
		},

		clearTweaks: (args) => {
			const id = OptStr(args, "id");
			const story = OptStr(args, "story");
			const resolved = OptBool(args, "resolved");
			const all = OptBool(args, "all");
			if (id === undefined && story === undefined && resolved !== true && all !== true)
				Fail("clearTweaks: pass id, story, resolved = true or all = true");
			const removed = DeleteTweaks((t) => {
				if (id !== undefined) return t.Id === id;
				if (story !== undefined) return t.Story === story || t.StoryName === story;
				if (resolved === true) return t.Resolved;
				return true;
			}, OptBool(args, "restore") ?? true);
			return { removed };
		},

		showOriginal: (args) => {
			SetShowOriginal(OptBool(args, "original") ?? true);
			Settle(2);
			return { showingOriginal: IsShowingOriginal() };
		},

		deleteComments: (args) => {
			const id = OptStr(args, "id");
			const story = OptStr(args, "story");
			const removed = DeleteComments((c) => {
				if (id !== undefined) return c.Id === id;
				if (story !== undefined) return c.Story === story || c.StoryName === story;
				if (args.resolved === true) return c.Resolved;
				return args.all === true;
			});
			return { removed };
		}
	};

	const folder = new Instance("Folder");
	folder.Name = AGENT_FOLDER_NAME;
	folder.Archivable = false;

	const invoke = new Instance("BindableFunction");
	invoke.Name = "Invoke";
	invoke.Parent = folder;
	invoke.OnInvoke = (command: unknown, args: unknown) => {
		const handler = commands[command as string];
		if (!handler) {
			const names: string[] = [];
			for (const [name] of pairs(commands)) names.push(name as string);
			return { ok: false, error: `unknown command '${tostring(command)}' (${names.join(", ")})` };
		}
		const [ok, result] = pcall(() => {
			options.EnsureRoot();
			// the story list fills a few frames after the app mounts
			WaitUntil(() => GetStoryModules().size() > 0, 3);
			currentCommand = command as string;
			if (args !== undefined && !typeIs(args, "table")) Fail(`${currentCommand}: arguments must be a table`);
			return handler((args ?? {}) as Args);
		});
		if (!ok) return { ok: false, error: tostring(result) };
		return { ok: true, result: result };
	};

	const api = new Instance("ModuleScript");
	api.Name = "API";
	const [sourceOk] = pcall(() => {
		(api as unknown as { Source: string }).Source = API_SOURCE;
	});
	if (sourceOk) api.Parent = folder;

	// replace a stale folder (plugin reload)
	CoreGui.FindFirstChild(AGENT_FOLDER_NAME)?.Destroy();
	folder.Parent = CoreGui;

	return () => {
		folder.Destroy();
	};
}
