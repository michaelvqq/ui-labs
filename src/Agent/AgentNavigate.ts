import Configs from "Plugin/Configs";
import { RootProducer } from "Reflex";

import { FlashElement } from "./AgentActivity";
import { FindElementByPath } from "./AgentComments";

/** Opens `story` (a module full name) in the main tab if it isn't already, then flashes `element` once it renders. */
export function OpenItem(story: string, element: string | undefined, label: string) {
	const state = RootProducer.getState();
	const module = state.moduleList.story.list.find((m) => m.GetFullName() === story);
	if (!module) return false;
	const root = state.storyPreview.mountPreviews.get(Configs.RootPreviewKey);
	if (!root || root.Module !== module) {
		RootProducer.unmountStory(Configs.RootPreviewKey);
		RootProducer.mountStory(module, false);
	}
	RootProducer.selectStory(Configs.RootPreviewKey);
	if (element === undefined) return true; // page comment: nothing to highlight

	task.spawn(() => {
		const start = os.clock();
		while (os.clock() - start < 6) {
			const entry = RootProducer.getState().storyPreview.mountPreviews.get(Configs.RootPreviewKey);
			if (!entry || entry.Module !== module) return;
			const holder = entry.Holder;
			if (holder) {
				const found = FindElementByPath(holder, element);
				if (found && found.IsA("GuiObject") && found.AbsoluteSize.X > 0) {
					task.wait(0.1);
					FlashElement(found, entry.ListenerFrame, label, 2.5);
					return;
				}
			}
			task.wait(0.2);
		}
	});
	return true;
}
