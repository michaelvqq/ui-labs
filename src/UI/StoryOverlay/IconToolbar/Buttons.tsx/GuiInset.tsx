import Immut from "@rbxts/immut";
import React, { useCallback } from "@rbxts/react";
import { useProducer } from "@rbxts/react-reflex";
import SpriteButton from "UI/Utils/SpriteButton";

import { ToolButtonProps } from "../ToolButtonsList";

// Shows Roblox's top bar band and the device safe areas (notch, home indicator) over the story
function GuiInset(props: ToolButtonProps) {
	const { updateMountData } = useProducer<RootProducer>();
	const entry = props.PreviewEntry;

	const OnToggle = useCallback(() => {
		updateMountData(entry.Key, (old) =>
			Immut.produce(old, (draft) => {
				draft.ShowInset = !draft.ShowInset;
			})
		);
	}, [entry]);

	return (
		<SpriteButton
			ButtonName={props.ButtonName}
			Sprite="Expand"
			Description="GUI inset (Roblox top bar + phone safe areas)"
			Active={entry.ShowInset === true}
			OnClick={OnToggle}
			OnRightClick={props.OnRightClick}
			Order={props.Order}
			Shortcut={Enum.KeyCode.G}
			ShortcutModifier={Enum.ModifierKey.Shift}
		/>
	);
}

export default GuiInset;
