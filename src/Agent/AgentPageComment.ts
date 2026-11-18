import { RemoveExtension } from "Hooks/Reflex/Control/ModuleList/Utils";
import Configs from "Plugin/Configs";
import { FlattenControls } from "UI/StoryPanel/StoryTools/CommentElements";

import { AddComment, CurrentViewport } from "./AgentComments";
import { GetControlHandle } from "./AgentRegistry";

/** Saves a comment about the whole story (no element), with its controls and the viewport size. */
export function AddPageComment(entry: PreviewEntry, text: string) {
	const body = text.gsub("^%s+", "")[0].gsub("%s+$", "")[0];
	if (body === "") return undefined;
	const handle = GetControlHandle(entry.Key);
	return AddComment({
		Story: entry.Module.GetFullName(),
		StoryName: RemoveExtension(entry.Module.Name, Configs.Extensions.Story),
		Element: "",
		ElementClass: "",
		Scope: "story",
		Rect: { X: 0, Y: 0, Width: 0, Height: 0 },
		Text: body,
		Controls: handle ? FlattenControls(handle.Values) : undefined,
		Viewport: CurrentViewport()
	});
}
