import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { useState } from "@rbxts/react";
import { useProducer, useSelector } from "@rbxts/react-reflex";
import { CommentsChanged } from "Agent/AgentComments";
import { TweaksChanged } from "Agent/AgentTweaks";
import { useTheme } from "Hooks/Reflex/Use/Theme";
import { selectCommentsPanel } from "Reflex/Interface";
import { CountOpenItems } from "UI/Overlays/CommentsPanel";
import Corner from "UI/Styles/Corner";

const BADGE = Color3.fromRGB(255, 92, 168);

// Opens the Comments & tweaks panel; the badge counts items not done yet
function CommentsButton() {
	const theme = useTheme();
	const open = useSelector(selectCommentsPanel);
	const { setCommentsPanel } = useProducer<RootProducer>();
	const [count, setCount] = useState(CountOpenItems);

	useEventListener(CommentsChanged, () => setCount(CountOpenItems()));
	useEventListener(TweaksChanged, () => setCount(CountOpenItems()));

	return (
		<textbutton
			key={"CommentsButton"}
			LayoutOrder={2}
			Size={new UDim2(1, 0, 0, 27)}
			BackgroundColor3={open ? theme.StoryPreview.Selected : theme.Search.Color}
			Text={""}
			AutoButtonColor={true}
			Event={{ Activated: () => setCommentsPanel(!open) }}
		>
			<Corner Radius={6} />
			<textlabel
				Position={UDim2.fromOffset(10, 0)}
				Size={new UDim2(1, -50, 1, 0)}
				BackgroundTransparency={1}
				Text={"Comments & tweaks"}
				TextColor3={open ? theme.StoryPreview.TextSelected : theme.Text.Color}
				FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Medium)}
				TextSize={13}
				TextXAlignment={Enum.TextXAlignment.Left}
			/>
			{count > 0 ? (
				<textlabel
					AnchorPoint={new Vector2(1, 0.5)}
					Position={new UDim2(1, -8, 0.5, 0)}
					Size={UDim2.fromOffset(0, 18)}
					AutomaticSize={Enum.AutomaticSize.X}
					BackgroundColor3={BADGE}
					Text={tostring(count)}
					TextColor3={new Color3(1, 1, 1)}
					FontFace={Font.fromName("GothamSSm", Enum.FontWeight.Bold)}
					TextSize={11}
				>
					<Corner Radius={9} />
					<uipadding PaddingLeft={new UDim(0, 6)} PaddingRight={new UDim(0, 6)} />
				</textlabel>
			) : undefined}
		</textbutton>
	);
}

export default CommentsButton;
