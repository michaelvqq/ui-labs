import React, { useCallback } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { selectTweakTool } from "Reflex/Interface";
import SpriteButton from "UI/Utils/SpriteButton";

import { ToolButtonProps } from "../ToolButtonsList";

// Tweak tool: click an element and edit its properties live; changes are recorded for an AI agent
function TweakTool(props: ToolButtonProps) {
	const { setTweakTool, setCommentTool, setSelectTool } = useProducer<RootProducer>();
	const tweakTool = useSelector(selectTweakTool);

	const OnToggle = useCallback(() => {
		if (!tweakTool) {
			setSelectTool(false);
			setCommentTool(false);
		}
		setTweakTool(!tweakTool);
	}, [tweakTool]);

	return (
		<SpriteButton
			ButtonName={props.ButtonName}
			Sprite="Theme"
			Description="Tweak Properties (click an element, edit values; recorded for AI)"
			Active={tweakTool}
			OnClick={OnToggle}
			OnRightClick={props.OnRightClick}
			Order={props.Order}
			Shortcut={Enum.KeyCode.T}
			ShortcutModifier={Enum.ModifierKey.Shift}
		/>
	);
}

export default TweakTool;
