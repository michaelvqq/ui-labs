import React, { useCallback } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { selectCommentTool } from "Reflex/Interface";
import SpriteButton from "UI/Utils/SpriteButton";

import { ToolButtonProps } from "../ToolButtonsList";

// Comment tool: click an element in the story and leave a note an AI agent reads through the agent bridge
function CommentTool(props: ToolButtonProps) {
	const { setCommentTool, setSelectTool, setTweakTool } = useProducer<RootProducer>();
	const commentTool = useSelector(selectCommentTool);

	const OnToggle = useCallback(() => {
		if (!commentTool) {
			setSelectTool(false);
			setTweakTool(false);
		}
		setCommentTool(!commentTool);
	}, [commentTool]);

	return (
		<SpriteButton
			ButtonName={props.ButtonName}
			Sprite="Picker"
			Description="Comment For AI (click an element, type, Enter)"
			Active={commentTool}
			OnClick={OnToggle}
			OnRightClick={props.OnRightClick}
			Order={props.Order}
			Shortcut={Enum.KeyCode.N}
			ShortcutModifier={Enum.ModifierKey.Shift}
		/>
	);
}

export default CommentTool;
