import { Signal } from "@rbxts/lemon-signal";
import { HttpService } from "@rbxts/services";

// Comments a human leaves on story elements (Comment tool) for an AI agent to read through the bridge.
// Stored in plugin settings so they survive Studio restarts.

export interface AgentComment {
	Id: string;
	Story: string; // story module full name
	StoryName: string;
	Element: string; // path from the story root, e.g. "SellWindow/Tabs/Frame[2]"; "" for a page comment
	Scope?: "element" | "story"; // "story" = about the whole page, no element
	Viewport?: { Width: number; Height: number }; // viewport size when it was made
	ElementClass: string;
	ElementText?: string;
	Rect: { X: number; Y: number; Width: number; Height: number }; // relative to the story root, unscaled by zoom
	Text: string;
	Controls?: Record<string, string>; // control values when the comment was made (stringified)
	Created: number; // os.time()
	Resolved: boolean;
	Claimed?: boolean; // an agent has picked it up (In progress)
	Seen?: boolean; // an agent has read it
	SeenAt?: number;
	SeenBy?: string;
	Note?: string; // agent's note: what it's doing (claim) or what it changed (resolve)
	ClaimedAt?: number;
	ResolvedAt?: number;
}

const SETTING_KEY = "UILabsAgentComments";
let pluginRef: Plugin | undefined;
let cache: AgentComment[] | undefined;

export const CommentsChanged = new Signal<[]>();

export function SetCommentsPlugin(p: Plugin) {
	pluginRef = p;
	cache = undefined;
}

export function GetComments(): AgentComment[] {
	if (cache) return cache;
	if (!pluginRef) return [];
	const [ok, stored] = pcall(() => pluginRef!.GetSetting(SETTING_KEY));
	cache = ok && typeIs(stored, "table") ? (stored as AgentComment[]) : [];
	return cache;
}

function Save(list: AgentComment[]) {
	cache = list;
	if (pluginRef) pcall(() => pluginRef!.SetSetting(SETTING_KEY, list));
	CommentsChanged.Fire();
}

/** Viewport size now (for recording which layout a comment/tweak was made on). */
export function CurrentViewport() {
	const camera = game.GetService("Workspace").CurrentCamera;
	return {
		Width: camera ? math.round(camera.ViewportSize.X) : 0,
		Height: camera ? math.round(camera.ViewportSize.Y) : 0
	};
}

export function AddComment(comment: Omit<AgentComment, "Id" | "Created" | "Resolved">) {
	const full: AgentComment = {
		...comment,
		Id: HttpService.GenerateGUID(false).sub(1, 8),
		Created: os.time(),
		Resolved: false
	};
	const list = [...GetComments(), full];
	Save(list);
	return full;
}

export function UpdateComment(id: string, changes: Partial<AgentComment>) {
	let found: AgentComment | undefined;
	const list = GetComments().map((comment) => {
		if (comment.Id !== id) return comment;
		found = { ...comment, ...changes, Id: comment.Id };
		return found;
	});
	if (found) Save(list);
	return found;
}

export function DeleteComments(predicate: (comment: AgentComment) => boolean) {
	const before = GetComments();
	const list = before.filter((comment) => !predicate(comment));
	if (list.size() !== before.size()) Save(list);
	return before.size() - list.size();
}

/** Path of `gui` below `root`, names joined by "/", with [n] when siblings share a name. */
export function GetElementPath(root: Instance, gui: Instance) {
	const parts: string[] = [];
	let current: Instance | undefined = gui;
	while (current && current !== root) {
		const parent: Instance | undefined = current.Parent;
		let name = current.Name;
		if (parent) {
			const same = parent.GetChildren().filter((child) => child.Name === current!.Name);
			if (same.size() > 1) name = `${name}[${same.indexOf(current) + 1}]`;
		}
		parts.unshift(name);
		current = parent;
	}
	return parts.join("/");
}

/** Finds the element a comment path points at (best effort; the tree may have changed). */
export function FindElementByPath(root: Instance, path: string) {
	let current: Instance | undefined = root;
	for (const part of path.split("/")) {
		if (!current || part === "") continue;
		const [name, index] = part.match("^(.-)%[(%d+)%]$") as LuaTuple<[string?, string?]>;
		if (name !== undefined && index !== undefined) {
			const same: Instance[] = current.GetChildren().filter((child) => child.Name === name);
			current = same[tonumber(index)! - 1];
		} else {
			current = current.FindFirstChild(part);
		}
	}
	return current;
}
