import React, { useCallback } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { selectCommentsPanel, selectPageComposer } from "Reflex/Interface";
import SpriteButton from "UI/Utils/SpriteButton";

import { ToolButtonProps } from "../ToolButtonsList";

// Opens the page comment box (a comment about the whole story, no element) in the Comments & tweaks panel
function PageComment(props: ToolButtonProps) {
	const { setPageComposer } = useProducer<RootProducer>();
	const composing = useSelector(selectPageComposer);
	const panelOpen = useSelector(selectCommentsPanel);
	const active = composing && panelOpen;

	const OnClick = useCallback(() => setPageComposer(!active), [active]);

	return (
		<SpriteButton
			ButtonName={props.ButtonName}
			Sprite="StoryIcon"
			Description="Page comment (whole story)"
			Active={active}
			OnClick={OnClick}
			OnRightClick={props.OnRightClick}
			Order={props.Order}
			Shortcut={Enum.KeyCode.P}
			ShortcutModifier={Enum.ModifierKey.Shift}
		/>
	);
}

export default PageComment;
