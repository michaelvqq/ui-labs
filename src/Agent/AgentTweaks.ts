import { Signal } from "@rbxts/lemon-signal";
import { HttpService, RunService } from "@rbxts/services";
import { RootProducer } from "Reflex";

import { FindElementByPath } from "./AgentComments";
import { DecodeValue, EncodedValue, EncodeValue, ValuesEqual } from "./AgentValues";

// Property tweaks a person makes in the Tweak tool, recorded for an AI agent to copy into code.
// Stored in plugin settings like comments; re-applied to mounted stories (also after Vide re-renders).

export interface AgentTweak {
	Id: string;
	Story: string;
	StoryName: string;
	Element: string; // path from the story root
	ElementClass: string;
	ElementText?: string;
	Target: string; // "" for the element itself, else the child's class (UICorner, UIStroke, UIPadding, ...)
	Property: string;
	Old: EncodedValue;
	New: EncodedValue;
	Controls?: Record<string, string>;
	Viewport: { Width: number; Height: number };
	Mode: "widget" | "viewport" | "agent";
	Created: number;
	Updated: number;
	Resolved: boolean;
	Claimed?: boolean; // an agent has picked it up (In progress)
	Seen?: boolean; // an agent has read it
	SeenAt?: number;
	SeenBy?: string;
	Note?: string; // agent's note: what it's doing (claim) or what it changed (resolve)
	ClaimedAt?: number;
	ResolvedAt?: number;
}

/** What the Tweak panel offers, in order. Target "" = the element itself. */
export const TWEAKABLE: { Target: string; Property: string; Label?: string }[] = [
	{ Target: "", Property: "Text" },
	{ Target: "", Property: "TextSize" },
	{ Target: "", Property: "TextColor3" },
	{ Target: "", Property: "FontFace", Label: "FontWeight" },
	{ Target: "", Property: "TextXAlignment" },
	{ Target: "", Property: "TextYAlignment" },
	{ Target: "", Property: "TextScaled" },
	{ Target: "", Property: "TextWrapped" },
	{ Target: "", Property: "Size" },
	{ Target: "", Property: "Position" },
	{ Target: "", Property: "AnchorPoint" },
	{ Target: "", Property: "BackgroundColor3" },
	{ Target: "", Property: "BackgroundTransparency" },
	{ Target: "", Property: "ImageColor3" },
	{ Target: "", Property: "ImageTransparency" },
	{ Target: "", Property: "ScaleType" },
	{ Target: "", Property: "Visible" },
	{ Target: "", Property: "ZIndex" },
	{ Target: "", Property: "Rotation" },
	{ Target: "UICorner", Property: "CornerRadius" },
	{ Target: "UIStroke", Property: "Thickness" },
	{ Target: "UIStroke", Property: "Color" },
	{ Target: "UIStroke", Property: "Transparency" },
	{ Target: "UIPadding", Property: "PaddingLeft" },
	{ Target: "UIPadding", Property: "PaddingRight" },
	{ Target: "UIPadding", Property: "PaddingTop" },
	{ Target: "UIPadding", Property: "PaddingBottom" },
	{ Target: "UIListLayout", Property: "Padding" },
	{ Target: "UIGridLayout", Property: "CellSize" },
	{ Target: "UIGridLayout", Property: "CellPadding" },
	{ Target: "UIScale", Property: "Scale" },
	{ Target: "UITextSizeConstraint", Property: "MaxTextSize" }
];

const SETTING_KEY = "AILabsTweaks";
let pluginRef: Plugin | undefined;
let cache: AgentTweak[] | undefined;
let showOriginal = false;

export const TweaksChanged = new Signal<[]>();

export function SetTweaksPlugin(p: Plugin) {
	pluginRef = p;
	cache = undefined;
}

export function GetTweaks(): AgentTweak[] {
	if (cache) return cache;
	if (!pluginRef) return [];
	const [ok, stored] = pcall(() => pluginRef!.GetSetting(SETTING_KEY));
	cache = ok && typeIs(stored, "table") ? (stored as AgentTweak[]) : [];
	return cache;
}

function Save(list: AgentTweak[]) {
	cache = list;
	if (pluginRef) pcall(() => pluginRef!.SetSetting(SETTING_KEY, list));
	TweaksChanged.Fire();
}

export function GetTargetInstance(element: Instance, target: string): Instance | undefined {
	if (target === "") return element;
	return element.FindFirstChildOfClass(target as keyof Instances);
}

export function ReadProperty(instance: Instance, property: string): LuaTuple<[boolean, unknown]> {
	const [ok, value] = pcall(() => (instance as unknown as Record<string, unknown>)[property]);
	return $tuple(ok, value);
}

export function WriteProperty(instance: Instance, property: string, value: unknown) {
	const [ok] = pcall(() => {
		(instance as unknown as Record<string, unknown>)[property] = value;
	});
	return ok;
}

/** Records (or updates) the tweak for this story/element/target/property. Keeps the first Old value. */
export function RecordTweak(tweak: Omit<AgentTweak, "Id" | "Created" | "Updated" | "Resolved">) {
	const list = [...GetTweaks()];
	const index = list.findIndex(
		(t) =>
			!t.Resolved &&
			t.Story === tweak.Story &&
			t.Element === tweak.Element &&
			t.Target === tweak.Target &&
			t.Property === tweak.Property
	);
	const now = os.time();
	let saved: AgentTweak;
	if (index >= 0) {
		saved = { ...list[index], ...tweak, Old: list[index].Old, Updated: now };
		list[index] = saved;
	} else {
		saved = { ...tweak, Id: HttpService.GenerateGUID(false).sub(1, 8), Created: now, Updated: now, Resolved: false };
		list.push(saved);
	}
	Save(list);
	return saved;
}

export function UpdateTweak(id: string, changes: Partial<AgentTweak>) {
	let found: AgentTweak | undefined;
	const list = GetTweaks().map((t) => {
		if (t.Id !== id) return t;
		found = { ...t, ...changes, Id: t.Id };
		return found;
	});
	if (found) Save(list);
	return found;
}

/** Removes tweaks; with `restore`, puts their original values back on mounted stories first. */
export function DeleteTweaks(predicate: (t: AgentTweak) => boolean, restore = false) {
	const before = GetTweaks();
	const removed = before.filter(predicate);
	if (removed.isEmpty()) return 0;
	if (restore) ApplyValues(removed, "Old");
	Save(before.filter((t) => !predicate(t)));
	return removed.size();
}

export function IsShowingOriginal() {
	return showOriginal;
}

export function SetShowOriginal(value: boolean) {
	if (showOriginal === value) return;
	showOriginal = value;
	ApplyValues(
		GetTweaks().filter((t) => !t.Resolved),
		value ? "Old" : "New"
	);
	TweaksChanged.Fire();
}

function MountedHolders() {
	const holders = new Map<string, Frame[]>();
	RootProducer.getState().storyPreview.mountPreviews.forEach((entry) => {
		if (!entry.Holder || !entry.Holder.Parent) return;
		const story = entry.Module.GetFullName();
		const list = holders.get(story) ?? [];
		list.push(entry.Holder);
		holders.set(story, list);
	});
	return holders;
}

function ApplyValues(tweaks: AgentTweak[], which: "Old" | "New") {
	const holders = MountedHolders();
	for (const tweak of tweaks) {
		for (const holder of holders.get(tweak.Story) ?? []) {
			const element = FindElementByPath(holder, tweak.Element);
			if (!element) continue;
			const instance = GetTargetInstance(element, tweak.Target);
			if (!instance) continue;
			const [ok, current] = ReadProperty(instance, tweak.Property);
			if (!ok) continue;
			const value = DecodeValue(tweak[which], current);
			if (value === undefined || ValuesEqual(current, value)) continue;
			WriteProperty(instance, tweak.Property, value);
		}
	}
}

/** Keeps unresolved tweaks applied to mounted stories (re-renders and remounts overwrite them). */
export function StartTweakApplier() {
	let elapsed = 0;
	const connection = RunService.Heartbeat.Connect((dt) => {
		elapsed += dt;
		if (elapsed < 0.2) return;
		elapsed = 0;
		if (showOriginal) return;
		const pending = GetTweaks().filter((t) => !t.Resolved);
		if (pending.isEmpty()) return;
		ApplyValues(pending, "New");
	});
	return () => connection.Disconnect();
}

export function EncodeOrString(value: unknown): EncodedValue {
	return EncodeValue(value) ?? { t: "string", v: tostring(value) };
}
